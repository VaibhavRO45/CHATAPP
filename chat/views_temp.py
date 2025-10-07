from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from .models import Message
from django.db.models import Q
import datetime
import logging
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.utils import timezone

logger = logging.getLogger(__name__)

@login_required
@require_POST
@csrf_exempt
def delete_message(request, message_id):
    message = get_object_or_404(Message, id=message_id)
    delete_for = request.POST.get('delete_for', 'me')
    
    if delete_for == 'all' and message.sender == request.user:
        # Hard delete for everyone
        message_id = message.id
        room_group_name = f"chat_{''.join(sorted([request.user.username, message.receiver.username]))}"
        message.delete()
        
        # Broadcast deletion to all clients
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            room_group_name,
            {
                'type': 'chat_message',
                'action': 'delete',
                'message_id': message_id,
                'delete_for': delete_for,
                'sender': request.user.username,
                'receiver': message.receiver.username,
                'is_deleted': True
            }
        )
    elif delete_for == 'me':
        # Soft delete for current user only
        if not hasattr(message, 'deleted_for'):
            message.deleted_for = []
        if request.user not in message.deleted_for:
            message.deleted_for.append(request.user)
            message.save()
            
            # Broadcast soft delete to current user only
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"chat_{request.user.username}",
                {
                    'type': 'chat_message',
                    'action': 'delete',
                    'message_id': message_id,
                    'delete_for': delete_for,
                    'sender': request.user.username,
                    'receiver': message.receiver.username,
                    'is_deleted': True
                }
            )

    return JsonResponse({
        'status': 'success',
        'message_id': message_id,
        'delete_for': delete_for,
        'sender': request.user.username,
        'receiver': message.receiver.username
    })

@login_required
def chat_room(request, room_name):
    search_query = request.GET.get('search', '') 
    users = User.objects.exclude(id=request.user.id) 
    chats = Message.objects.filter(
        (Q(sender=request.user) & Q(receiver__username=room_name)) |
        (Q(receiver=request.user) & Q(sender__username=room_name))
    ).exclude(
        Q(deleted_for=request.user) | Q(is_deleted=True)
    )

    if search_query:
        chats = chats.filter(Q(content__icontains=search_query))  

    chats = chats.order_by('timestamp') 
    user_last_messages = []

    for user in users:
        last_message = Message.objects.filter(
            (Q(sender=request.user) & Q(receiver=user)) |
            (Q(receiver=request.user) & Q(sender=user))
        ).exclude(
            Q(deleted_for=request.user) | Q(is_deleted=True)
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

    return render(request, 'chat.html', {
        'room_name': room_name,
        'chats': chats,
        'users': users,
        'user_last_messages': user_last_messages,
        'search_query': search_query 
    })
