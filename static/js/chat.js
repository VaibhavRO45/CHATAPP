/*const chatbox = document.querySelector("#chat-box");
const sendButton = document.querySelector("#send-button");

// Function to scroll to the bottom of the chatbox
function scrollToBottom() {
  if (chatbox && chatbox.scrollHeight) {
    chatbox.scrollTop = chatbox.scrollHeight;
  }
}

// Scroll to bottom when the page is loaded
scrollToBottom();

// WebSocket connection
const roomName = JSON.parse(document.getElementById("room_slug").textContent);
const webSocketUrl = "ws://" + window.location.host + "/ws/chat/" + roomName + "/";
const chatSocket = new WebSocket(webSocketUrl);

// Handle incoming WebSocket messages
chatSocket.onmessage = function (event) {
    const data = JSON.parse(event.data);
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message");

    // Display message and file
    if (data.file) {
        if (data.file.endsWith(".jpg") || data.file.endsWith(".png") || data.file.endsWith(".jpeg")) {
            messageDiv.innerHTML = `<img src="${data.file}" class="img-fluid" />`;
        } else {
            messageDiv.innerHTML = `<a href="${data.file}" target="_blank">Download file</a>`;
        }
    }

    messageDiv.innerHTML += `<strong>${data.sender}:</strong> ${data.message}`;
    chatbox.appendChild(messageDiv);
    scrollToBottom();
};

// Send message or file
sendButton.onclick = function (e) {
    var messageInput = document.querySelector("#message-input").value;
    var fileInput = document.querySelector("#file-input").files[0];
    var selectedLanguage = document.querySelector("#language").value;

    if (!messageInput && !fileInput) {
        alert("Please enter a message or select a file.");
        return;
    }

    // Translate the message
    var translatedMessage = translateMessage(messageInput, selectedLanguage);

    // Send data through WebSocket
    chatSocket.send(
        JSON.stringify({
            message: translatedMessage,
            file: fileInput ? fileInput.name : null,
            username: "{{ request.user.username }}",
            room_name: "{{ room_name }}",
        })
    );

    // Clear inputs
    document.querySelector("#message-input").value = "";
    document.querySelector("#file-input").value = "";
};

// Function to translate message using Django backend
async function translateMessage(message, language) {
    if (!message || language === 'en') return message;
    
    try {
        const response = await fetch('/translate/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({
                text: message,
                target_lang: language
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.error) {
            console.error("Translation error:", data.error);
            return message;
        }
*/

