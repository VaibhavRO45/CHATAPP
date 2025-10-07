from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from . import views

urlpatterns = [
    path('chat/<str:room_name>/', views.chat_room, name='chat_room'),
    path('delete/<int:message_id>/', views.delete_message, name='delete_message'),
    path('create_group/', views.create_group, name='create_group'),
    path('add_group_member/<str:group_name>/', views.add_group_member, name='add_group_member'),
    path("ask-gpt/", views.chatgpt_response, name="chatgpt_response"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
