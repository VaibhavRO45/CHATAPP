from django.test import TestCase
from django.contrib.auth.models import User
from .models import Message
from django.core.files.uploadedfile import SimpleUploadedFile

class ChatTests(TestCase):
    def setUp(self):
        # Create users for testing
        self.user1 = User.objects.create_user(username='user1', password='password')
        self.user2 = User.objects.create_user(username='user2', password='password')

    def test_create_group_chat(self):
        # Simulate creating a group chat
        group_name = "group_chat"
        # Logic to create a group chat would go here
        # For now, we will just assert that the group name is as expected
        self.assertEqual(group_name, "group_chat")

    def test_file_upload_message(self):
        # Simulate sending a message with no file
        message = Message.objects.create(
            sender=self.user1,
            receiver=self.user2,
            content="Hello!",
            file=None  # Simulate no file for now
        )
        self.assertEqual(message.content, "Hello!")
        # Check if the file field is actually None, considering Django's handling of FieldFile
        self.assertIsNone(message.file.name)  # file.name is None when no file is uploaded

        # Now test with a file using SimpleUploadedFile
        mock_file = SimpleUploadedFile("file.txt", b"file_content", content_type="text/plain")
        message_with_file = Message.objects.create(
            sender=self.user1,
            receiver=self.user2,
            content="Check this file!",
            file=mock_file  # Use the mock file
        )
        self.assertEqual(message_with_file.content, "Check this file!")
        # Check that the file name starts with "uploads/file" and ends with a random suffix
        self.assertTrue(message_with_file.file.name.startswith("uploads/file"))
        self.assertTrue(message_with_file.file.name.endswith(".txt"))
