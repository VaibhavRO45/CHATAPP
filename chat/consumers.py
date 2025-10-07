import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import User
from .models import Message
from asgiref.sync import sync_to_async
from datetime import datetime

logger = logging.getLogger(__name__)

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        user = self.scope['user']
        from .models import Group
        try:
            group = await sync_to_async(Group.objects.get)(name=self.room_name)
            self.is_group = True
            self.group = group
            self.room_group_name = f"group_{group.id}"
        except Group.DoesNotExist:
            self.is_group = False
            self.group = None
            other_user = self.room_name
            self.room_group_name = f"chat_{''.join(sorted([user.username, other_user]))}"

        logger.info(f"WebSocket connecting to room: {self.room_group_name}")
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        text_data_json = json.loads(text_data)
        action = text_data_json.get('action')

        if action == 'typing':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'chat_message',
                    'action': 'typing',
                    'sender': self.scope['user'].username,
                    'is_typing': text_data_json.get('is_typing')
                }
            )
            return

        if action == 'delete':
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'chat_message',
                    'action': 'delete',
                    'message_id': text_data_json.get('message_id'),
                    'delete_for': text_data_json.get('delete_for'),
                    'sender': text_data_json.get('sender'),
                    'receiver': text_data_json.get('receiver')
                }
            )
            return

        message_obj = text_data_json.get('message')
        message_text = message_obj.get('text') if isinstance(message_obj, dict) else message_obj
        file_data = text_data_json.get('file')
        sender = self.scope['user']

        if (not message_text or message_text.strip() == '') and not file_data:
            return

        file_obj = None
        if file_data and isinstance(file_data, dict):
            from django.core.files.base import ContentFile
            import base64
            file_obj = ContentFile(
                base64.b64decode(file_data.get('data')),
                name=file_data.get('name')
            )

        if self.is_group:
            message = await self.save_message(sender, None, message_text, file_obj, group=self.group)
        else:
            receiver = await self.get_receiver_user()
            message = await self.save_message(sender, receiver, message_text, file_obj)

        # Send file info (name + url) to frontend
        file_response = None
        if message.file:
            file_response = {
                'name': message.file.name,
                'url': f"/media/{message.file.name}"
            }

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'chat_message',
                'sender': sender.username,
                'receiver': None if self.is_group else receiver.username,
                'message': message_obj,
                'file': file_response,
                'message_id': message.id,
                'group': self.group.name if self.is_group else None
            }
        )

    async def chat_message(self, event):
        message = event.get('message')
        sender = event.get('sender')
        receiver = event.get('receiver')
        file = event.get('file')
        action = event.get('action')
        message_id = event.get('message_id')
        group = event.get('group')

        if action == 'typing':
            await self.send(text_data=json.dumps({
                'action': 'typing',
                'sender': sender,
                'is_typing': event.get('is_typing'),
                'timestamp': datetime.now().isoformat()
            }))
            return

        if action == 'delete':
            delete_for = event.get('delete_for')
            current_user = self.scope['user'].username
            is_sender = current_user == sender
            is_receiver = current_user == receiver

            if delete_for == 'all' or (delete_for == 'me' and (is_sender or is_receiver)):
                await self.send(text_data=json.dumps({
                    'action': 'delete',
                    'message_id': message_id,
                    'delete_for': delete_for,
                    'sender': sender,
                    'receiver': receiver,
                    'is_deleted': True
                }))
            return

        if (not message or (isinstance(message, dict) and not message.get('text'))) and not file:
            return

        await self.send(text_data=json.dumps({
            'sender': sender,
            'receiver': receiver,
            'message': message,
            'file': file,
            'message_id': message_id,
            'group': group,
            'timestamp': datetime.now().isoformat()
        }))

    @sync_to_async
    def save_message(self, sender, receiver, message, file, group=None):
        content = message if message else ''
        if file:
            import os
            if not os.path.exists('media'):
                os.makedirs('media')

            from django.core.files.storage import default_storage
            file_path = default_storage.save(file.name, file)

            return Message.objects.create(
                sender=sender,
                receiver=receiver,
                content=content,
                file=file_path,
                group=group
            )
        else:
            return Message.objects.create(
                sender=sender,
                receiver=receiver,
                content=content,
                group=group
            )

    @sync_to_async
    def get_receiver_user(self):
        return User.objects.get(username=self.room_name)
