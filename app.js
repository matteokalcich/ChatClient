let socket;
let clientId = null;
let selectedClientId = null;
let username = null;
let chats = {};
let pallini = new Map();

const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
let peerConnection;
let localStream;
let pendingCandidates = [];

let status_call, startCall;

document.addEventListener("DOMContentLoaded", () => {
  username = prompt("Inserisci il tuo nome utente:");
  if (!username) return alert("Nome utente obbligatorio.");

  status_call = document.getElementById("status");
  startCall = document.getElementById("startCall");

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
    debugger;
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
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
  
    alert("❌ Chiamata terminata");
    document.getElementById("startCall").style.display = "inline-block";
    document.getElementById("endCall").style.display = "none";
  };
  
  

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
        if (!chats[data.from]) chats[data.from] = [];
        chats[data.from].push({ from: data.from, text: data.text });

        if (data.from == selectedClientId) renderMessages(data.from);
        else {
          const pallino = pallini.get(data.from);
          if (pallino) pallino.style.display = "inline-block";
        }
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
        if (peerConnection) {
          peerConnection.close();
          peerConnection = null;
        }
        document.getElementById("endCall").style.display = "none";
        alert("❌ Chiamata rifiutata");
        break;
    }
  };

  document.getElementById("sendButton").onclick = () => {
    const input = document.getElementById("messageInput");
    const text = input.value.trim();
    if (!text || !selectedClientId) return;

    socket.send(JSON.stringify({ type: "message", to: selectedClientId, text }));
    if (!chats[selectedClientId]) chats[selectedClientId] = [];
    chats[selectedClientId].push({ from: clientId, text });

    renderMessages(selectedClientId);
    input.value = "";
  };
});

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

//Gestione css per la barra chiamata in arrivo
let pendingCall = null;

function showCallBar(callerName) {
  const bar = document.getElementById("incomingCallBar");
  document.getElementById("callerName").textContent = callerName;
  bar.classList.add("active");
}

function hideCallBar() {
  document.getElementById("incomingCallBar").classList.remove("active");
}
