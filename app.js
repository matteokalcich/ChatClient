let socket;
let clientId = null;
let selectedClientId = null;
let chats = {};
let username = null;
let pallini = new Map();
const config = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

let startCall;
let status_call;

let localStream;
let peerConnection;
let pendingCandidates = [];

document.addEventListener('DOMContentLoaded', () => {
  username = prompt('Inserisci il tuo nome utente:');
  if (!username) {
    alert('Nome utente obbligatorio.');
    return;
  }

  status_call = document.getElementById('status');
  startCall = document.getElementById('startCall');

  startCall.onclick = async () => {
    if (!selectedClientId) {
      alert('Seleziona un utente prima di avviare la chiamata.');
      return;
    }

    await createPeerConnection();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.send(JSON.stringify({ type: 'offer', offer, to: selectedClientId }));

    status_call.textContent = '📞 In attesa di risposta...';
  };

  socket = new WebSocket('ws://localhost:8081');

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'setName', name: username }));
  };

  socket.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type == 'init') {
      clientId = msg.id;
    }

    if (msg.type == 'userList') {
      clientId = msg.id;
      updateUserList(msg.users);
    }

    if (msg.type == 'message') {
      const from = msg.from;
      const text = msg.text;

      if (!chats[from]) chats[from] = [];
      chats[from].push({ from, text });

      if (from == selectedClientId) {
        renderMessages(from);
      } else {
        const pallino = pallini.get(from);
        if (pallino) {
          pallino.style.display = 'inline-block';
        }
      }
    }

    else if (msg.type === 'offer') {
      selectedClientId = msg.from;

      await createPeerConnection();
      await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.offer));

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.send(JSON.stringify({ type: 'answer', answer, to: selectedClientId }));

      pendingCandidates.forEach(candidate => {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      });
      pendingCandidates = [];

      status_call.textContent = '✅ Chiamata ricevuta';
    }

    else if (msg.type === 'answer') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.answer));
      status_call.textContent = '✅ Chiamata connessa';

      pendingCandidates.forEach(candidate => {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      });
      pendingCandidates = [];
    }

    else if (msg.type === 'ice-candidate') {
      if (peerConnection?.remoteDescription) {
        peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } else {
        pendingCandidates.push(msg.candidate);
      }
    }
  };

  document.getElementById('sendButton').addEventListener('click', () => {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (text && selectedClientId) {
      socket.send(JSON.stringify({ type: 'message', to: selectedClientId, text }));

      if (!chats[selectedClientId]) chats[selectedClientId] = [];
      chats[selectedClientId].push({ from: clientId, text });

      renderMessages(selectedClientId);
      input.value = '';
    }
  });
});

function updateUserList(users) {
  const listDiv = document.getElementById('userList');
  listDiv.innerHTML = '';
  pallini.clear();

  users.forEach((user) => {
    if (user.id == clientId) return;

    const wrapperDiv = document.createElement('div');
    wrapperDiv.className = 'userEntry';
    wrapperDiv.style.display = 'flex';
    wrapperDiv.style.alignItems = 'center';
    wrapperDiv.style.gap = '8px';

    const btn = document.createElement('button');
    btn.className = 'userButton';
    btn.textContent = user.name;
    btn.onclick = () => {
      selectedClientId = user.id;
      document.getElementById('chatHeader').textContent = 'Chat con ' + user.name;
      const btnCall = document.createElement('button');
      btnCall.textContent = 'Test';

      document.getElementById('chatHeader').appendChild(btnCall);

      document.querySelectorAll('.userEntry button').forEach(el => el.style.background = 'none');
      btn.style.backgroundColor = '#ccc';

      const pallino = pallini.get(user.id);
      if (pallino) {
        pallino.style.display = 'none';
      }

      renderMessages(user.id);
    };

    const pallino = document.createElement('img');
    pallino.src = 'pallinoVerde.png';
    pallino.alt = 'Pallino Verde';
    pallino.style.display = 'none';
    pallino.style.width = '15px';
    pallino.style.height = '12px';

    wrapperDiv.appendChild(btn);
    wrapperDiv.appendChild(pallino);
    listDiv.appendChild(wrapperDiv);

    pallini.set(user.id, pallino);
  });
}

function renderMessages(userId) {
  const box = document.getElementById('chatMessages');
  box.innerHTML = '';

  const messages = chats[userId] || [];
  messages.forEach((msg) => {
    const div = document.createElement('div');
    div.className = msg.from == clientId ? 'sent' : 'received';
    div.textContent = msg.text;
    box.appendChild(div);
  });

  box.scrollTop = box.scrollHeight;
}

async function createPeerConnection() {
  peerConnection = new RTCPeerConnection(config);

  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    const remoteAudio = new Audio();
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.play();
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.send(JSON.stringify({ 
        type: 'ice-candidate', 
        candidate: event.candidate, 
        to: selectedClientId 
      }));
    }
  };
}
