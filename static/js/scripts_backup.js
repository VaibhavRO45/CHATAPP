document.addEventListener("DOMContentLoaded", function() {
  const chatbox = document.querySelector("#chatbox");
  const sendButton = document.querySelector("#submit_button");
  const myInput = document.querySelector("#my_input");
  const fileInput = document.querySelector("#file-input");
  //const chatSocket = new WebSocket('ws://your-websocket-url');

  function scrollToBottom() {
    chatbox.scrollTop = chatbox.scrollHeight;
  }

  scrollToBottom();
  myInput.focus();

  let typingTimeout;
  const TYPING_TIMEOUT = 2000; // 2 seconds 

  myInput.onkeyup = function(e) {
    if (e.keyCode == 13) {
      e.preventDefault();
      sendButton.click();
    } else {
      // Clear previous timeout if exists
      clearTimeout(typingTimeout);
      
      // Only send typing event if WebSocket is open
      if (chatSocket.readyState === WebSocket.OPEN) {
        console.log('Sending typing start event');
        chatSocket.send(JSON.stringify({
          action: 'typing',
          is_typing: true,
          room_name: window.currentRoom,
          sender: window.currentUser
        }));
      } else {
        console.error('WebSocket not ready:', chatSocket.readyState);
      }
      
      // Set timeout to send typing stopped
      typingTimeout = setTimeout(() => {
        if (chatSocket.readyState === WebSocket.OPEN) {
          console.log('Sending typing stop event');
          chatSocket.send(JSON.stringify({
            action: 'typing',
            is_typing: false,
            room_name: window.currentRoom,
            sender: window.currentUser
          }));
        }
      }, TYPING_TIMEOUT);
    }
  };

  // Handle delete actions
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('delete-btn')) {
      const messageElement = e.target.closest('.chat-message');
      const messageId = messageElement.dataset.messageId;
      const deleteFor = e.target.dataset.action;
      
      console.log('Delete action:', deleteFor); // Debug log
      
      fetch(`/delete/${messageId}/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRFToken': getCookie('csrftoken'),
            },
            body: JSON.stringify({
              delete_for: deleteFor
            })
          })
          .then(response => {
            if (!response.ok) {
              return response.text().then(text => {
                throw new Error(text || 'Delete failed');
              });
            }
            return response.json();
          })
          .then(data => {
            // Update UI immediately based on delete type
            if (deleteFor === 'all') {
              messageElement.querySelector('.message-content').innerHTML = '<span class="deleted-message">This message was deleted</span>';
              messageElement.classList.add('deleted');
              messageElement.querySelectorAll('.delete-btn').forEach(btn => btn.remove());
            } else if (deleteFor === 'me') {
              // For "delete for me", completely remove the message from UI
              messageElement.remove();
            }
            
            // WebSocket will handle updating other clients
            chatSocket.send(JSON.stringify({
              action: 'delete',
              message_id: data.message_id,
              delete_for: deleteFor,
              sender: data.sender,
              receiver: data.receiver,
              is_deleted: true
            }));
          })
          .catch(error => {
            console.error('Delete error:', error);
            alert('Failed to delete message');
          });
    }
  });

  // Helper function to get CSRF token
  function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === (name + '=')) {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  }

  chatSocket.onmessage = async function(event) {
    console.log('WebSocket message received:', event.data);
    const data = JSON.parse(event.data);
    
    if (data.action === 'refresh') {
      location.reload();
      return;
    }
    
    if (data.action === 'typing') {
      console.log('Typing event:', data);
      const typingIndicator = document.querySelector('.typing-indicator');
      if (!typingIndicator) {
        console.error('Typing indicator element not found');
        return;
      }
      
      // Only show typing indicator for other users
      if (data.sender !== window.currentUser) {
        if (data.is_typing) {
          console.log('Showing typing indicator for', data.sender);
          typingIndicator.textContent = `${data.sender} is typing...`;
          typingIndicator.style.display = 'block';
        } else {
          console.log('Hiding typing indicator');
          typingIndicator.style.display = 'none';
        }
      }
      return;
    }
    
    if (data.action === 'delete') {
      console.log('Processing delete action:', data);
      const messageElements = document.querySelectorAll(`.chat-message[data-message-id="${data.message_id}"]`);
      
      if (messageElements.length > 0) {
        const currentUser = window.currentUser;
        const isSender = currentUser === data.sender;
        const isReceiver = currentUser === data.receiver;

        if (data.delete_for === 'all') {
          // For "delete for all", show deleted message for everyone
          messageElements.forEach(messageElement => {
            messageElement.querySelector('.message-content').innerHTML = 
              '<span class="deleted-message">This message was deleted</span>';
            messageElement.classList.add('deleted');
            messageElement.querySelectorAll('.delete-btn').forEach(btn => btn.remove());
          });

          // Send confirmation back
          if (chatSocket.readyState === WebSocket.OPEN) {
            chatSocket.send(JSON.stringify({
              'action': 'delete_ack',
              'message_id': data.message_id,
              'status': 'deleted'
            }));
          }
        } else if (data.delete_for === 'me') {
          // For "delete for me", only remove if current user is sender or receiver
          if (isSender || isReceiver) {
            messageElements.forEach(messageElement => {
              messageElement.remove();
            });
          }
        }
      }
      return;
    }

    const messageDiv = document.createElement("div"); 
    messageDiv.classList.add("chat-message");
    // Fix message alignment: messages sent by current user should be on left side (sender class)
    // Messages from others on right side (receiver class)
    if (data.sender === window.currentUser) {
      messageDiv.classList.add("sender");
    } else {
      messageDiv.classList.add("receiver");
    }
    messageDiv.dataset.messageId = data.message_id || Date.now();

    const header = document.createElement("div");
    header.className = "message-header";

    // Format time as hh:mm (24-hour or 12-hour format can be adjusted)
    function formatTime(date) {
      let hours = date.getHours();
      let minutes = date.getMinutes();
      // Pad with leading zeros if needed
      if (hours < 10) hours = '0' + hours;
      if (minutes < 10) minutes = '0' + minutes;
      return `${hours}:${minutes}`;
    }

    const timeString = formatTime(new Date(data.timestamp || Date.now()));
    header.innerHTML = `<strong>${data.sender}</strong><small class="timestamp">${timeString}</small>`;
    messageDiv.appendChild(header);

    if (data.message) {
      const content = document.createElement("div");
      content.className = "message-content";
      let messageText = typeof data.message === 'object' ? data.message.text : data.message;
      content.textContent = messageText;
      
      // Add delete buttons if not deleted
      if (!data.is_deleted) {
        const actions = document.createElement("div");
        actions.className = "message-actions";
        actions.innerHTML = `
          <button class="delete-btn" data-action="me">Delete for me</button>
          ${data.sender === window.currentUser ? '<button class="delete-btn" data-action="all">Delete for everyone</button>' : ''}
        `;
        content.appendChild(actions);
      }
      
      messageDiv.appendChild(content);
    }

    if (data.file) {
      const fileDiv = document.createElement("div");
      fileDiv.className = "file-message";
      const fileUrl = data.file.startsWith('media/') ? `/${data.file}` : `/media/${data.file}`;
      const ext = data.file.name.split('.').pop().toLowerCase();
      if (['jpg', 'png', 'jpeg'].includes(ext)) {
        fileDiv.innerHTML = `<img src="${fileUrl}" class="img-fluid" />`;
      } else {
        fileDiv.innerHTML = `
          <div class="document-container">
            <div class="document-icon">
              <i class="fas ${getFileIcon(ext)}"></i>
            </div>
            <div class="document-info">
              <div class="document-name">${data.file.name}</div>
              <div class="document-meta">
                <span>${formatFileSize(data.file.size)}</span>
                <a href="${fileUrl}" class="document-download" download>Download</a>
              </div>
            </div>
          </div>
        `;
      }
      messageDiv.appendChild(fileDiv);
    }
    
    // Insert date separator if needed
    function formatDate(date) {
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      return date.toLocaleDateString(undefined, options);
    }

    function isSameDay(d1, d2) {
      return d1.getFullYear() === d2.getFullYear() &&
             d1.getMonth() === d2.getMonth() &&
             d1.getDate() === d2.getDate();
    }

    const lastMessage = chatbox.lastElementChild;
    let lastMessageDate = null;
    if (lastMessage && lastMessage.classList.contains('chat-message')) {
      const lastTimestampElem = lastMessage.querySelector('.timestamp');
      if (lastTimestampElem) {
        const lastTimeText = lastTimestampElem.textContent;
        // We only have time in timestamp, so we cannot get full date here
        // Instead, we can store last message date in a data attribute or parse from message data
        // For simplicity, assume messages are appended in order and use current date for new messages
        lastMessageDate = new Date();
      }
    } else if (lastMessage && lastMessage.classList.contains('date-separator')) {
      // If last element is date separator, get its date
      const dateText = lastMessage.textContent;
      lastMessageDate = new Date(dateText);
    }

    const messageDate = new Date();

    // Insert date separator if last message date is different day
    if (!lastMessageDate || !isSameDay(lastMessageDate, messageDate)) {
      const dateSeparator = document.createElement('div');
      dateSeparator.className = 'date-separator';
      dateSeparator.textContent = formatDate(messageDate);
      chatbox.appendChild(dateSeparator);
    }

    chatbox.appendChild(messageDiv);
    scrollToBottom();
    updateSidebar(data);
    
    // Send refresh command to all clients
    // Removed to prevent infinite reload loop
  };

  // File input change handler
  fileInput.addEventListener('change', function() {
    const file = fileInput.files[0];
    if (file) {
      // Show file info
      const fileInfo = document.createElement('div');
      fileInfo.className = 'file-info';
      fileInfo.innerHTML = `
        <span>${file.name}</span>
        <small>(${formatFileSize(file.size)})</small>
        <button class="btn btn-sm btn-danger remove-file">×</button>
      `;
      
      // Insert before send button
      const inputGroup = document.querySelector('.input-group');
      inputGroup.insertBefore(fileInfo, sendButton.parentNode);
      
      // Add remove file handler
      fileInfo.querySelector('.remove-file').addEventListener('click', function() {
        fileInput.value = '';
        fileInfo.remove();
      });
    }
  });

  sendButton.onclick = async function() {
    const messageInput = myInput.value;
    const file = fileInput.files[0];
    if (!messageInput && !file) {
      alert("Please enter a message or select a file.");
      return;
    }

    // Immediately hide typing indicator when sending
    const typingIndicator = document.querySelector('.typing-indicator');
    if (typingIndicator) {
      typingIndicator.style.display = 'none';
    }

    // Validate file size (max 10MB)
    if (file && file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    const messageData = {
      message: { text: messageInput },
      file: file ? await readFileAsBase64(file) : null,
      username: "{{ request.user.username }}",
      room_name: "{{ room_name }}",
    };

    // Clear file preview if exists
    const fileInfo = document.querySelector('.file-info');
    if (fileInfo) fileInfo.remove();

    chatSocket.send(JSON.stringify(messageData));
    myInput.value = "";
    fileInput.value = "";
  };

  function getFileIcon(ext) {
    const icons = {
      pdf: 'fa-file-pdf',
      doc: 'fa-file-word',
      docx: 'fa-file-word',
      txt: 'fa-file-alt'
    };
    return icons[ext] || 'fa-file';
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
    else return (bytes/1048576).toFixed(1) + ' MB';
  }

  function updateSidebar(data) {
    const lastMessage = document.querySelector(".list-group-item.active #last-message");
    const timestamp = document.querySelector(".list-group-item.active small");
    if (lastMessage) {
      lastMessage.innerHTML = data.sender === "{{ request.user.username }}" ? `You: ${data.message}` : data.message;
      timestamp.innerHTML = new Date().toUTCString().slice(17, 22);
    }
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        name: file.name,
        data: reader.result.split(',')[1]
      });
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  // Voice typing feature
  const voiceBtn = document.getElementById('voice-btn');
  let recognition;
  let recognizing = false;

  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let accumulatedFinalTranscript = '';

    recognition.onstart = () => {
      recognizing = true;
      voiceBtn.classList.add('listening');
      voiceBtn.title = 'Stop voice typing';
      console.log('Voice recognition started');
    };

    recognition.onerror = (event) => {
      console.error('Voice recognition error', event.error);
    };

    let recognitionStoppedAt = null;

    recognition.onend = () => {
      recognizing = false;
      recognitionStoppedAt = Date.now();
      voiceBtn.classList.remove('listening');
      voiceBtn.title = 'Start voice typing';
      console.log('Voice recognition ended');
    };

    let silenceTimeout;

    recognition.onresult = (event) => {
      let interimTranscript = '';
      // let finalTranscript = '';  // no longer needed here

      // Reset silence timeout on each result event
      if (silenceTimeout) {
        clearTimeout(silenceTimeout);
      }
      silenceTimeout = setTimeout(() => {
        recognition.stop();
        console.log('Voice recognition stopped due to 10 seconds of silence');
      }, 5000); // 5 seconds

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          accumulatedFinalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      myInput.value = accumulatedFinalTranscript + interimTranscript;
    };

    voiceBtn.addEventListener('click', () => {
      console.log('Voice button clicked. Recognizing:', recognizing);
      if (recognizing) {
        recognition.stop();
      } else {
        // If input has existing text, initialize accumulatedFinalTranscript with it to append
        if (myInput.value.trim().length > 0) {
          accumulatedFinalTranscript = myInput.value;
        } else {
          accumulatedFinalTranscript = '';
        }
        recognitionStoppedAt = null;
        recognition.start();
      }
    });
  } else {
    voiceBtn.style.display = 'none';
    console.warn('Speech recognition not supported in this browser.');
  }
});

document.addEventListener('DOMContentLoaded', function() {
  const picker = document.getElementById('emoji-picker');
  const button = document.getElementById('emoji-btn');
  const input = document.getElementById('my_input');
  
  if (!picker || !button || !input) return;

  // Wait for the emoji-picker element to be fully defined before using it
  if (typeof customElements !== 'undefined') {
    customElements.whenDefined('emoji-picker').then(() => {
      picker.style.display = 'none';
      picker.style.position = 'absolute';
      picker.style.bottom = '60px';
      picker.style.right = '10px';
      picker.style.zIndex = '1000';
      
      button.addEventListener('click', () => {
        picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
      });
      
      picker.addEventListener('emoji-click', event => {
        input.value += event.detail.unicode;
        input.focus();
        picker.style.display = 'none';
      });
      
      document.addEventListener('click', (event) => {
        if (!button.contains(event.target) && !picker.contains(event.target)) {
          picker.style.display = 'none';
        }
      });
    });
  } else {
    // Fallback if customElements is not supported
    picker.style.display = 'none';
    picker.style.position = 'absolute';
    picker.style.bottom = '60px';
    picker.style.right = '10px';
    picker.style.zIndex = '1000';
    
    button.addEventListener('click', () => {
      picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
    });
    
    picker.addEventListener('emoji-click', event => {
      input.value += event.detail.unicode;
      input.focus();
      picker.style.display = 'none';
    });
    
    document.addEventListener('click', (event) => {
      if (!button.contains(event.target) && !picker.contains(event.target)) {
        picker.style.display = 'none';
      }
    });
  }
});

function openNav() {
  document.getElementById("mySidebar").classList.add("open");
  document.querySelector(".chat").classList.add("sidebar-open");
  document.querySelector(".right-panel").style.display = "none";  // Hide right panel
}

// Close the sidebar and show the right panel
function closeNav() {
  document.getElementById("mySidebar").classList.remove("open");
  document.querySelector(".chat").classList.remove("sidebar-open");
  document.querySelector(".right-panel").style.display = "block";  // Show right panel
}
