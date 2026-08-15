const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startCallButton = document.getElementById('startCallButton');
const toggleAudioBtn = document.getElementById('toggleAudio');
const toggleVideoBtn = document.getElementById('toggleVideo');
const shareScreenBtn = document.getElementById('shareScreenBtn');
const endCallBtn = document.getElementById('endCallButton');

// Sidebar Elements
const tabChat = document.getElementById('tabChat');
const tabHistory = document.getElementById('tabHistory');
const chatPanel = document.getElementById('chatPanel');
const historyPanel = document.getElementById('historyPanel');
const chatBox = document.getElementById('chatBox');
const chatInput = document.getElementById('chatInput');
const sendMsgBtn = document.getElementById('sendMsgBtn');
const historyBox = document.getElementById('historyBox');

let localStream;
let peerConnection;
let dataChannel; // Chat ke liye naya channel
const socket = new WebSocket('ws://localhost:8080/signaling'); 

const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };

// --- 1. History Logger ---
function logEvent(action) {
    const time = new Date().toLocaleTimeString();
    historyBox.innerHTML += `<div class="log-entry">[${time}] ${action}</div>`;
    historyBox.scrollTop = historyBox.scrollHeight;
}

// --- 2. Tab Switching Logic ---
tabChat.onclick = () => {
    tabChat.classList.add('active'); tabHistory.classList.remove('active');
    chatPanel.style.display = 'flex'; historyPanel.style.display = 'none';
};
tabHistory.onclick = () => {
    tabHistory.classList.add('active'); tabChat.classList.remove('active');
    historyPanel.style.display = 'flex'; chatPanel.style.display = 'none';
};

// --- 3. Camera Setup ---
async function startCamera() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        logEvent("Camera & Mic Started");
    } catch (error) { console.error("Camera access denied", error); }
}
startCamera();

// --- 4. WebRTC Connection Setup ---
socket.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    if (!peerConnection) createPeerConnection();

    if (message.type === 'offer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.send(JSON.stringify({ type: 'answer', answer: answer }));
        logEvent("Received Incoming Call");
    } else if (message.type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
        logEvent("Call Connected Successfully");
    } else if (message.type === 'candidate') {
        await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
};

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(servers);
    
    // Create Data Channel for Chat
    dataChannel = peerConnection.createDataChannel('chat');
    setupDataChannel(dataChannel);
    
    peerConnection.ondatachannel = (event) => {
        setupDataChannel(event.channel);
    };

    localStream.getTracks().forEach(track => { peerConnection.addTrack(track, localStream); });
    
    peerConnection.ontrack = (event) => { remoteVideo.srcObject = event.streams[0]; };
    
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) { socket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate })); }
    };
}

// --- 5. Chat Logic ---
function setupDataChannel(channel) {
    channel.onmessage = (event) => {
        chatBox.innerHTML += `<div class="msg peer"><strong>Friend:</strong> ${event.data}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
    };
}

sendMsgBtn.onclick = () => {
    const msg = chatInput.value;
    if (msg.trim() !== '' && dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(msg);
        chatBox.innerHTML += `<div class="msg me"><strong>You:</strong> ${msg}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
        chatInput.value = '';
        logEvent("Message Sent");
    } else if (!dataChannel || dataChannel.readyState !== 'open') {
        alert("Pehle call connect karein!");
    }
};

// --- 6. Screen Share Logic ---
shareScreenBtn.onclick = async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        const videoSender = peerConnection.getSenders().find(s => s.track.kind === 'video');
        
        videoSender.replaceTrack(screenTrack);
        localVideo.srcObject = screenStream;
        shareScreenBtn.innerText = "Sharing Screen";
        shareScreenBtn.style.color = "#00ff00";
        logEvent("Started Screen Sharing");

        // Jab screen share stop ho jaye
        screenTrack.onended = () => {
            videoSender.replaceTrack(localStream.getVideoTracks()[0]);
            localVideo.srcObject = localStream;
            shareScreenBtn.innerText = "Share Screen";
            shareScreenBtn.style.color = "#ff8c00";
            logEvent("Stopped Screen Sharing");
        };
    } catch (error) { console.error("Screen share cancelled"); }
};

// --- 7. Call Controls ---
startCallButton.onclick = async () => {
    createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.send(JSON.stringify({ type: 'offer', offer: offer }));
    logEvent("Initiated Call Offer");
};

let isAudioMuted = false;
let isVideoOff = false;

toggleAudioBtn.onclick = () => {
    isAudioMuted = !isAudioMuted;
    localStream.getAudioTracks()[0].enabled = !isAudioMuted; 
    toggleAudioBtn.innerText = isAudioMuted ? "Mic: Off" : "Mic: On";
    toggleAudioBtn.style.color = isAudioMuted ? "#ff3333" : "#ff8c00";
    logEvent(isAudioMuted ? "Mic Muted" : "Mic Unmuted");
};

toggleVideoBtn.onclick = () => {
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks()[0].enabled = !isVideoOff; 
    toggleVideoBtn.innerText = isVideoOff ? "Cam: Off" : "Cam: On";
    toggleVideoBtn.style.color = isVideoOff ? "#ff3333" : "#ff8c00";
    logEvent(isVideoOff ? "Camera Turned Off" : "Camera Turned On");
};

endCallBtn.onclick = () => {
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    remoteVideo.srcObject = null;
    logEvent("Stream Disconnected");
    alert("Stream Ended");
};