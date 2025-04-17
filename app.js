let socket;
let clientId = null;
let selectedClientId = null;
let chats = {}; 
let username = null;
let pallini = new Map(); // <--- per salvare riferimento ai pallini
const config = { //config server for call
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

let startCall;
let status_call;

let localStream;
let peerConnection;

document.addEventListener("DOMContentLoaded", () => {
  
  username = prompt("Inserisci il tuo nome utente:");
  if (!username) {
    alert("Nome utente obbligatorio.");
    return;
  }

  status_call = document.getElementById('status');
  startCall = document.getElementById('startCall');

  startCall.onclick = async () => {

    debugger;
    await createPeerConnection();
  
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.send(JSON.stringify({ type: 'offer', offer }));
  
    status_call.textContent = "📞 In attesa di risposta...";
  };

  socket = new WebSocket("ws://localhost:8081");

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: "setName", name: username }));
  };

  socket.onmessage = async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type == "init") {
      clientId = msg.id;
    }

    if (msg.type == "userList") {
      clientId = msg.id;
      updateUserList(msg.users);
    }

    if (msg.type == "message") {
      const from = msg.from;
      const text = msg.text;

      if (!chats[from]) chats[from] = [];
      chats[from].push({ from, text });

      if (from == selectedClientId) {
        renderMessages(from);
      } else {
        // Mostra il pallino verde
        const pallino = pallini.get(from);
        if (pallino) {
          pallino.style.display = "inline-block";
        }
      }
    }
    else if (data.type === 'offer') {
      await createPeerConnection();
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
  
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.send(JSON.stringify({ type: 'answer', answer }));
  
      // ✅ Ora possiamo processare le ICE candidate salvate
      pendingCandidates.forEach(candidate => {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      });
      pendingCandidates = [];
  
      status.textContent = "✅ Chiamata ricevuta";
  
    } else if (data.type === 'answer') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      status.textContent = "✅ Chiamata connessa";
  
      // ✅ Ora possiamo processare le ICE candidate salvate
      pendingCandidates.forEach(candidate => {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      });
      pendingCandidates = [];
  
    } else if (data.type === 'ice-candidate') {
      if (peerConnection?.remoteDescription) {
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        pendingCandidates.push(data.candidate);
      }
    }
  };

  document.getElementById("sendButton").addEventListener("click", () => {
    const input = document.getElementById("messageInput");
    const text = input.value.trim();
    if (text && selectedClientId) {
      socket.send(JSON.stringify({ type: "message", to: selectedClientId, text }));

      if (!chats[selectedClientId]) chats[selectedClientId] = [];
      chats[selectedClientId].push({ from: clientId, text });

      renderMessages(selectedClientId);
      input.value = "";
    }
  });
});

function updateUserList(users) {
  const listDiv = document.getElementById("userList");
  listDiv.innerHTML = "";
  pallini.clear(); // svuota la mappa

  users.forEach((user) => {
    if (user.id == clientId) return;

    const wrapperDiv = document.createElement("div");
    wrapperDiv.className = "userEntry";
    wrapperDiv.style.display = "flex";
    wrapperDiv.style.alignItems = "center";
    wrapperDiv.style.gap = "8px";

    const btn = document.createElement("button");
    btn.className = "userButton";
    btn.textContent = user.name;
    btn.onclick = () => {
        selectedClientId = user.id;
        document.getElementById("chatHeader").textContent = "Chat con " + user.name;
      
    
        document.querySelectorAll('.userEntry button').forEach(element => {
          element.style.background = "none";
        });
      
    
        btn.style.backgroundColor = "#ccc";
      
    
        const pallino = pallini.get(user.id);
        if (pallino) {
          pallino.style.display = "none";
        }
      
        renderMessages(user.id);
      };
      

    const pallino = document.createElement("img");
    pallino.src = "pallinoVerde.png";
    pallino.alt = "Pallino Verde";
    pallino.style.display = "none";
    pallino.style.width = "15px";
    pallino.style.height = "12px";

    wrapperDiv.appendChild(btn);
    wrapperDiv.appendChild(pallino);
    listDiv.appendChild(wrapperDiv);

    // Salva il riferimento al pallino per questo utente
    pallini.set(user.id, pallino);
  });
}

function renderMessages(userId) {
  const box = document.getElementById("chatMessages");
  box.innerHTML = "";

  const messages = chats[userId] || [];
  messages.forEach((msg) => {
    const div = document.createElement("div");
    div.className = msg.from == clientId ? "sent" : "received";
    div.textContent = msg.text;
    box.appendChild(div);
  });

  box.scrollTop = box.scrollHeight;
}

async function createPeerConnection() {
  peerConnection = new RTCPeerConnection(config);

  // Solo audio
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // Aggiungi tracce al peer
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Riproduci l'audio remoto
  peerConnection.ontrack = (event) => {
    const remoteAudio = new Audio();
    remoteAudio.srcObject = event.streams[0];
    remoteAudio.play();
  };

  // ICE candidate
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate }));
    }
  };
}