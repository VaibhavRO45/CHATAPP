import os
import json
import datetime
import logging
from django.conf import settings
import openai
import requests
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Q

from .models import Message, Group
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

channel_layer = get_channel_layer()
logger = logging.getLogger(__name__)


@login_required
@require_POST
@csrf_exempt
def delete_message(request, message_id):
    logger.info(f"Delete request received for message {message_id}")
    message = get_object_or_404(Message, id=message_id)

    try:
        data = json.loads(request.body)
        delete_for = data.get('delete_for', 'me')
    except:
        delete_for = request.POST.get('delete_for', 'me')

    logger.info(f"Delete type: {delete_for}, sender: {message.sender}, requester: {request.user}")

    if delete_for == 'all':
        if message.sender == request.user:
            logger.info("Processing delete for everyone")

            message_id = message.id
            sender = request.user.username
            receiver = message.receiver.username if message.receiver else None
            room_group_name = (
                f"chat_{''.join(sorted([sender, receiver]))}" if receiver
                else f"group_{message.group.name}" if message.group else None
            )

            # Soft delete
            message.is_deleted = True
            message.deleted_at = datetime.datetime.now()
            message.deleted_by = request.user

            # ✅ Optional cleanup: delete file if it exists
            try:
                if message.file and os.path.isfile(message.file.path):
                    os.remove(message.file.path)
                    message.file = None
            except Exception as e:
                logger.error(f"Error deleting file from disk: {e}")

            message.save()

            # Broadcast deletion
            if room_group_name:
                async_to_sync(channel_layer.group_send)(
                    room_group_name,
                    {
                        'type': 'chat_message',
                        'action': 'delete',
                        'message_id': message_id,
                        'delete_for': delete_for,
                        'sender': sender,
                        'receiver': receiver,
                        'group': message.group.name if message.group else None,
                        'is_deleted': True
                    }
                )

            return JsonResponse({
                'status': 'success',
                'message_id': message_id,
                'delete_for': delete_for,
                'sender': sender,
                'receiver': receiver,
                'group': message.group.name if message.group else None
            })

        else:
            return JsonResponse({
                'status': 'error',
                'message': 'Only the message sender can delete for everyone'
            }, status=403)

    elif delete_for == 'me':
        if message.group:
            message.deleted_for.add(request.user)
        else:
            if request.user == message.sender:
                message.sender_deleted = True
            else:
                message.receiver_deleted = True
        message.save()

        room_group_name = (
            f"group_{message.group.name}" if message.group
            else f"chat_{''.join(sorted([request.user.username, message.receiver.username]))}"
        ) if message.receiver or message.group else None

        if room_group_name:
            async_to_sync(channel_layer.group_send)(
                room_group_name,
                {
                    'type': 'chat_message',
                    'action': 'delete',
                    'message_id': message.id,
                    'delete_for': delete_for,
                    'sender': request.user.username,
                    'receiver': message.receiver.username if message.receiver else None,
                    'group': message.group.name if message.group else None,
                    'is_deleted': True
                }
            )

        return JsonResponse({
            'status': 'success',
            'message_id': message.id,
            'delete_for': delete_for,
            'sender': request.user.username,
            'receiver': message.receiver.username if message.receiver else None,
            'group': message.group.name if message.group else None
        })

    else:
        return JsonResponse({
            'status': 'error',
            'message': 'Invalid delete_for value'
        }, status=400)


@login_required
def chat_room(request, room_name):
    search_query = request.GET.get('search', '')
    users = User.objects.exclude(id=request.user.id)

    try:
        group = Group.objects.get(name=room_name)
        is_group = True
    except Group.DoesNotExist:
        group = None
        is_group = False

    if is_group:
        chats = Message.objects.filter(group=group).exclude(deleted_for=request.user)
        if search_query:
            chats = chats.filter(Q(content__icontains=search_query))
        chats = chats.order_by('timestamp')
        group_members = group.members.all()
    else:
        chats = Message.objects.filter(
            (Q(sender=request.user, receiver__username=room_name, sender_deleted=False) |
             Q(receiver=request.user, sender__username=room_name, receiver_deleted=False))
        )
        if search_query:
            chats = chats.filter(Q(content__icontains=search_query))
        chats = chats.order_by('timestamp')
        group_members = None

    user_last_messages = []

    for user in users:
        last_message = Message.objects.filter(
            (Q(sender=request.user, receiver=user, sender_deleted=False) |
             Q(receiver=request.user, sender=user, receiver_deleted=False))
        ).order_by('-timestamp').first()

        if last_message:
            user_last_messages.append({
                'user': user,
                'last_message': last_message
            })

    user_last_messages.sort(
        key=lambda x: x['last_message'].timestamp if x['last_message'] else datetime.datetime.min,
        reverse=True
    )

    groups = Group.objects.filter(members=request.user)

    return render(request, 'chat.html', {
        'room_name': room_name,
        'chats': chats,
        'users': users,
        'user_last_messages': user_last_messages,
        'groups': groups,
        'group_members': group_members,
        'is_group': is_group,
        'search_query': search_query
    })


@login_required
def create_group(request):
    if request.method == 'POST':
        group_name = request.POST.get('group_name')
        member_usernames = request.POST.getlist('members')
        if group_name and member_usernames:
            group, created = Group.objects.get_or_create(name=group_name)
            members = User.objects.filter(username__in=member_usernames)
            group.members.set(members)
            group.members.add(request.user)
            group.save()
            return redirect('chat_room', room_name=group_name)
    users = User.objects.exclude(id=request.user.id)
    return render(request, 'create_group.html', {'users': users})


@login_required
def add_group_member(request, group_name):
    group = get_object_or_404(Group, name=group_name)
    if request.method == 'POST':
        new_member_username = request.POST.get('username')
        if new_member_username:
            new_member = get_object_or_404(User, username=new_member_username)
            group.members.add(new_member)
            group.save()
            return redirect('chat_room', room_name=group_name)
    users = User.objects.exclude(id__in=group.members.all())
    return render(request, 'add_group_member.html', {'group': group, 'users': users})

@csrf_exempt
@require_POST
@login_required
def chatgpt_response(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            user_message = data.get("message", "")

            headers = {
                "Authorization": f"Bearer {settings.HUGGINGFACE_API_KEY}",
                "Content-Type": "application/json"
            }

            payload = {
                "inputs": user_message,
                "parameters": {
                    "max_new_tokens": 200,
                    "temperature": 0.7
                }
            }

            response = requests.post(
                "https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta",  # you can swap the model here
                headers=headers,
                json=payload
            )

            if response.status_code == 200:
                result = response.json()
                if isinstance(result, list):
                    reply = result[0]["generated_text"]
                else:
                    reply = result.get("generated_text", "No response generated.")
                return JsonResponse({"reply": reply})
            else:
                return JsonResponse({"error": response.json()}, status=500)

        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)