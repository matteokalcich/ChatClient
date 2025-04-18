/**********************
 * VARIABILI GLOBALI
 **********************/
let socket;
let clientId = null;
let selectedClientId = null;
let username = null;
let chats = {};
let pallini = new Map();

let peerConnection;
let localStream;
let pendingCandidates = [];
let pendingCall = null;

const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

let status_call, startCall;

/**********************
 * AVVIO DELL'APPLICAZIONE
 **********************/
document.addEventListener("DOMContentLoaded", () => {
  username = prompt("Inserisci il tuo nome utente:");
  if (!username) return alert("Nome utente obbligatorio.");

  // Assegno riferimenti ai pulsanti chiamata
  status_call = document.getElementById("status");
  startCall = document.getElementById("startCall");

  // Inizializzazione WebSocket
  initWebSocket();

  // Listener pulsanti chiamata
  initCallButtons();

  // Listener invio messaggio
  document.getElementById("sendButton").onclick = sendMessage;
});

/**********************
 * INIZIALIZZAZIONE SOCKET
 **********************/
function initWebSocket() {
  socket = new WebSocket('ws://localhost:8081');

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'setName', name: username }));
  };

  socket.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    debugger;

    switch (data.type) {
      case "init":
        clientId = data.id;
        break;

      case "userList":
        clientId = data.id;
        updateUserList(data.users);
        break;

      case "message":
        handleIncomingMessage(data);
        break;

      case "offer":
        pendingCall = { from: data.from, offer: data.offer };
        showCallBar(data.fromUser || "Sconosciuto");
        break;

      case "answer":
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        pendingCandidates.forEach(c => peerConnection.addIceCandidate(new RTCIceCandidate(c)));
        pendingCandidates = [];
        alert("✅ Chiamata connessa");
        break;

      case "ice-candidate":
        if (peerConnection?.remoteDescription) {
          peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          pendingCandidates.push(data.candidate);
        }
        break;

      case "reject":
        endCall();
        alert("❌ Chiamata rifiutata");
        break;
    }
  };
}

/**********************
 * GESTIONE MESSAGGI
 **********************/
function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text || !selectedClientId) return;

  socket.send(JSON.stringify({ type: "message", to: selectedClientId, text }));

  if (!chats[selectedClientId]) chats[selectedClientId] = [];
  chats[selectedClientId].push({ from: clientId, text });

  renderMessages(selectedClientId);
  input.value = "";
}

function handleIncomingMessage(data) {
  if (!chats[data.from]) chats[data.from] = [];
  chats[data.from].push({ from: data.from, text: data.text });

  if (data.from == selectedClientId) {
    renderMessages(data.from);
  } else {
    const pallino = pallini.get(data.from);
    if (pallino) pallino.style.display = "inline-block";
  }
}

/**********************
 * INTERFACCIA UTENTE: LISTA UTENTI E CHAT
 **********************/
function updateUserList(users) {
  const listDiv = document.getElementById("userList");
  listDiv.innerHTML = "";
  pallini.clear();

  users.forEach(user => {
    if (user.id == clientId) return;

    const wrapperDiv = document.createElement('div');
    wrapperDiv.className = 'userEntry';
    wrapperDiv.style.display = 'flex';
    wrapperDiv.style.alignItems = 'center';
    wrapperDiv.style.gap = '8px';

    const btn = document.createElement("button");
    btn.textContent = user.name;
    btn.onclick = () => {
      selectedClientId = user.id;
      document.getElementById("user").textContent = "Chat con " + user.name;

      document.querySelectorAll('.userEntry button').forEach(el => el.style.background = "none");
      btn.style.backgroundColor = "#ccc";

      const pallino = pallini.get(user.id);
      if (pallino) pallino.style.display = "none";

      renderMessages(user.id);
    };

    const pallino = document.createElement("img");
    pallino.src = "assets/pallinoVerde.png";
    pallino.style.display = "none";
    pallino.style.width = "15px";
    pallino.style.height = "12px";

    wrapperDiv.appendChild(btn);
    wrapperDiv.appendChild(pallino);
    listDiv.appendChild(wrapperDiv);
    pallini.set(user.id, pallino);
  });
}

function renderMessages(userId) {
  const box = document.getElementById("chatMessages");
  box.innerHTML = "";
  (chats[userId] || []).forEach(msg => {
    const div = document.createElement("div");
    div.className = msg.from == clientId ? "sent" : "received";
    div.textContent = msg.text;
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}

/**********************
 * GESTIONE CHIAMATE (WebRTC)
 **********************/
function initCallButtons() {
  document.getElementById("acceptCall").onclick = async () => {
    hideCallBar();

    await createPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(pendingCall.offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.send(JSON.stringify({
      type: 'answer',
      answer,
      to: pendingCall.from
    }));

    pendingCandidates.forEach(c => peerConnection.addIceCandidate(new RTCIceCandidate(c)));
    pendingCandidates = [];
    alert("✅ Chiamata accettata");
    pendingCall = null;
  };

  document.getElementById("rejectCall").onclick = () => {
    hideCallBar();
    let from = pendingCall.from;
    pendingCall = null;
    alert("❌ Chiamata rifiutata");
    socket.send(JSON.stringify({ type: 'reject', to: from }));
  };

  startCall.onclick = async () => {
    if (!selectedClientId) return alert("Seleziona un utente!");
    await createPeerConnection();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.send(JSON.stringify({
      type: 'offer',
      offer,
      to: selectedClientId
    }));

    alert("📞 In attesa di risposta...");
    document.getElementById("startCall").style.display = "none";
    document.getElementById("endCall").style.display = "inline-block";
  };

  document.getElementById("endCall").onclick = () => {
    endCall();
    alert("❌ Chiamata terminata");
  };
}

async function createPeerConnection() {
  peerConnection = new RTCPeerConnection(config);
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (e) => {
    const remoteAudio = new Audio();
    remoteAudio.srcObject = e.streams[0];
    remoteAudio.play();
  };

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      socket.send(JSON.stringify({
        type: 'ice-candidate',
        candidate: e.candidate,
        to: selectedClientId || pendingCall?.from
      }));
    }
  };
}

function endCall() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  document.getElementById("startCall").style.display = "inline-block";
  document.getElementById("endCall").style.display = "none";
}

/**********************
 * UI: BARRA CHIAMATA IN ARRIVO
 **********************/
function showCallBar(callerName) {
  const bar = document.getElementById("incomingCallBar");
  document.getElementById("callerName").textContent = callerName;
  bar.classList.add("active");
}

function hideCallBar() {
  document.getElementById("incomingCallBar").classList.remove("active");
}
