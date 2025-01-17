# Chat App

A real-time chat application built with Django for the backend and HTML, CSS, and JavaScript for the frontend. This app allows users to join different chat rooms and communicate instantly.

## Features

- **Real-time Messaging:** Chat with users in real-time using WebSockets.
- **User Authentication:** Register, log in, and manage accounts securely.
- **Multiple Chat Rooms:** Join and create different chat rooms.
- **Responsive Design:** The app is fully responsive and works on both desktop and mobile devices.

## Tech Stack

- **Backend:** Django
- **Frontend:** HTML, CSS, JavaScript
- **WebSockets:** For real-time communication (via Django Channels)
- **Database:** SQLite (default) or any other database supported by Django
- **Authentication:** Django’s built-in authentication system

## Installation

### Prerequisites

- Python (v3.6 or higher)
- pip (Python package installer)

### Steps to Run Locally

1. Clone the repository:
   ```bash
   git clone https://github.com/neszen/chat_app.git
   
2. Navigate to the project directory:
      cd chat_app

3. Set up a virtual environment (optional but recommended):

      python -m venv venv
      source venv/bin/activate 

4. Install the required dependencies:
      pip install -r requirements.txt

5. Apply database migrations:
      python manage.py migrate

6. Create a superuser (to access the Django admin interface):
      python manage.py createsuperuser

7. Run the development server:
      python manage.py runserver
