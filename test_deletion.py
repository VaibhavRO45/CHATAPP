import os
import django
import sys
from pathlib import Path

# Set up Django environment
BASE_DIR = Path(__file__).resolve().parent
sys.path.append(str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'chat_app.settings')
django.setup()

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.contrib.auth.models import User
from chat.models import Message

# Create test users
sender = User.objects.create_user(username='test_sender', password='testpass')
receiver = User.objects.create_user(username='test_receiver', password='testpass')

# Create test message
message = Message.objects.create(
    sender=sender,
    receiver=receiver,
    content="Test message for deletion"
)

print("=== Before deletion ===")
print(f"Message ID: {message.id}")
print(f"is_deleted: {message.is_deleted}")
print(f"deleted_for: {list(message.deleted_for.all())}")

# Simulate delete for everyone
channel_layer = get_channel_layer()
room_group_name = f"chat_{''.join(sorted([sender.username, receiver.username]))}"

# First update database
message.is_deleted = True
message.save()
message.deleted_for.add(sender)

# Then broadcast to all clients
async_to_sync(channel_layer.group_send)(
    room_group_name,
    {
        'type': 'chat_message',
        'action': 'delete',
        'message_id': message.id,
        'delete_for': 'all',
        'sender': sender.username,
        'receiver': receiver.username
    }
)

print("\n=== After deletion ===")
print(f"is_deleted: {message.is_deleted}")
print(f"deleted_for: {list(message.deleted_for.all())}")
print("Deletion event broadcasted to WebSocket group")
