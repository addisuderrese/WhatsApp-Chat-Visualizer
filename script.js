// DOM Elements
const folderInput = document.getElementById('folderInput');
const dropZone = document.getElementById('dropZone');
const landingView = document.getElementById('landingView');
const chatView = document.getElementById('chatView');
const themeToggle = document.getElementById('themeToggle');

// State
let fileMap = {}; // filename -> URL
let chatFile = null;

// Theme Logic
let isDark = localStorage.getItem('theme') === 'dark';
applyTheme(isDark);

themeToggle.addEventListener('click', () => {
    isDark = !isDark;
    applyTheme(isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');

    const sunIcon = document.getElementById('sunIcon');
    const moonIcon = document.getElementById('moonIcon');

    if (dark) {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
        themeToggle.setAttribute('aria-label', 'Switch to Light Mode');
    } else {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
        themeToggle.setAttribute('aria-label', 'Switch to Dark Mode');
    }
}

// Privacy Modal Logic
const privacyBtn = document.getElementById('privacyBtn');
const privacyModal = document.getElementById('privacyModal');
const closeModal = document.getElementById('closeModal');

privacyBtn.addEventListener('click', () => {
    privacyModal.classList.add('active');
});

closeModal.addEventListener('click', () => {
    privacyModal.classList.remove('active');
});

privacyModal.addEventListener('click', (e) => {
    if (e.target === privacyModal) {
        privacyModal.classList.remove('active');
    }
});

// Event Listeners for File Input
folderInput.addEventListener('change', handleFileInputChange);

// New Chat Button Logic
const newChatBtn = document.getElementById('newChatBtn');

newChatBtn.addEventListener('click', () => {
    // Reset State
    fileMap = {};
    chatFile = null;
    document.getElementById('chatContainer').innerHTML = '';

    // Switch View
    chatView.classList.add('hidden');
    landingView.classList.remove('hidden');
    newChatBtn.style.display = 'none';

    // Reset file input value so same folder can be selected again if needed
    folderInput.value = '';
});

// Event Listeners for Drag & Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    const items = e.dataTransfer.items;
    if (items) {
        // Clear previous state
        fileMap = {};
        chatFile = null;

        const fileEntries = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const entry = item.webkitGetAsEntry();
                if (entry) {
                    fileEntries.push(entry);
                }
            }
        }

        await processEntries(fileEntries);
        finalizeUpload();
    }
});

function handleFileInputChange(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    processFiles(files);
}

function processFiles(files) {
    fileMap = {};
    chatFile = null;

    files.forEach(file => {
        if (file.name.endsWith('.txt') && !chatFile) {
            chatFile = file;
        } else if (file.type.startsWith('image/')) {
            fileMap[file.name] = URL.createObjectURL(file);
        }
    });

    finalizeUpload();
}

async function processEntries(entries) {
    // Recursively process entries
    for (const entry of entries) {
        if (entry.isFile) {
            await new Promise((resolve) => {
                entry.file((file) => {
                    if (file.name.endsWith('.txt') && !chatFile) {
                        chatFile = file;
                    } else if (file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)) {
                        fileMap[file.name] = URL.createObjectURL(file);
                    }
                    resolve();
                });
            });
        } else if (entry.isDirectory) {
            const directoryReader = entry.createReader();
            const entries = await new Promise((resolve) => {
                directoryReader.readEntries(resolve);
            });
            await processEntries(entries);
        }
    }
}

function finalizeUpload() {
    if (chatFile) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const text = e.target.result;
            const messages = parseChat(text);
            renderChat(messages, fileMap);

            // Switch view
            landingView.classList.add('hidden');
            chatView.classList.remove('hidden');
            newChatBtn.style.display = 'block';
        };
        reader.readAsText(chatFile);
    } else {
        alert("No .txt chat file found. Please ensure you upload the correct folder.");
    }
}


// --- Chat Parsing and Rendering (Same logic as before, optimized) ---

function parseChat(text) {
    // Allow for invisible LTR/RTL marks at the start of the line
    const groupMessageRegex = /^[\u200e\u200f]?(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{1,2}:\d{2}\s?[AP]M)\s-\s/;
    const singleMessageRegex = /^[\u200E]?\[(\d{2}\/\d{2}\/\d{4}),\s(\d{2}:\d{2}:\d{2})\]\s/;

    const attachmentRegexGroup = /(.*) \(file attached\)/;
    const attachmentRegexSingle = /<attached:\s*(.*)>/;

    const lines = text.split('\n');
    const messages = [];
    let currentMessage = null;

    lines.forEach(line => {
        let match = line.match(groupMessageRegex);
        let isSingleFormat = false;

        if (!match) {
            match = line.match(singleMessageRegex);
            if (match) isSingleFormat = true;
        }

        if (match) {
            if (currentMessage) {
                messages.push(currentMessage);
            }

            const date = match[1];
            const time = match[2];
            const contentRaw = line.substring(match[0].length);

            const senderSeparator = contentRaw.indexOf(': ');

            // System message patterns (no sender, just action text)
            // Using \u2000-\u206f to cover various formatting chars (LTR, RTL, LRE, PDF, etc)
            const systemPatterns = [
                /^Messages and calls are end-to-end encrypted/i,
                /created this group/i,
                /added$/i,
                /were added$/i,
                /added .+$/i,
                /removed .+$/i,
                /left$/i,
                /joined using/i,
                /changed this group/i,
                /changed the subject/i,
                /changed the group/i,
                /turned on admin approval/i,
                /turned off admin approval/i,
                /is now an admin/i,
                /is no longer an admin/i,
                /changed the description/i,
                /deleted this group/i,
                /security code changed/i,
                /^You're now an admin/i,
                /changed their phone number/i,
                /This message was deleted/i,
                /<Media omitted>/i,
                /^~[\s\u2000-\u206f]*.+[\s\u2000-\u206f]+added/i,           // ~ username added
                /^~[\s\u2000-\u206f]*.+[\s\u2000-\u206f]+removed/i,         // ~ username removed
                /^~[\s\u2000-\u206f]*.+[\s\u2000-\u206f]+requested to add/i, // ~ username requested to add
                /^~[\s\u2000-\u206f]*.+[\s\u2000-\u206f]+left/i,            // ~ username left
                /^\+[\d\s\-\u2000-\u206f]+[\s\u2000-\u206f]+left$/i,        // +phone number left
                /^\+[\d\s\-\u2000-\u206f]+[\s\u2000-\u206f]+added/i,        // phone number added
                /^\+[\d\s\-\u2000-\u206f]+[\s\u2000-\u206f]+removed/i,      // phone number removed
                /requested to join/i,
                /waiting to join/i,
                /.+[\s\u2000-\u206f]+added[\s\u2000-\u206f]+[~+]/i,         // Name added ~ or Name added +
                /Tap to see all/i,            // "...and X others. Tap to see all."
            ];

            const isSystemMessage = systemPatterns.some(pattern => pattern.test(contentRaw));

            if (isSystemMessage || senderSeparator === -1) {
                currentMessage = {
                    date,
                    time,
                    sender: 'System',
                    content: contentRaw,
                    type: 'system',
                    isMe: false
                };
            } else {
                const sender = contentRaw.substring(0, senderSeparator);
                let messageContent = contentRaw.substring(senderSeparator + 2);
                let type = 'user';
                let attachmentName = null;

                let attachMatch;
                if (isSingleFormat) {
                    attachMatch = messageContent.match(attachmentRegexSingle);
                } else {
                    attachMatch = messageContent.match(attachmentRegexGroup);
                }

                if (attachMatch) {
                    type = 'image';
                    attachmentName = attachMatch[1].trim();
                }

                // Check for document omitted messages (single chat format)
                const docOmittedRegex = /^(.+\.(?:pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar))\s*•\s*(.+)\s*document omitted$/i;
                const docOmittedMatch = messageContent.match(docOmittedRegex);

                if (docOmittedMatch) {
                    type = 'document';
                    attachmentName = docOmittedMatch[1].trim();
                    // docOmittedMatch[2] contains page info like "13 pages"
                }

                // Clean up LTR marks
                messageContent = messageContent.replace(/[\u200E\u200F]/g, '');

                // Check for Call Messages
                const callRegex = /^(Missed voice call|Missed video call|Voice call|Video call)(?:,\s*(.*))?/;
                const callMatch = messageContent.match(callRegex);

                if (callMatch) {
                    type = 'call';
                    const callType = callMatch[1];
                    const callDetail = callMatch[2] || '';

                    currentMessage = {
                        date,
                        time, // Raw time string, we'll format it in renderChat
                        sender,
                        content: callType, // Main text (e.g. "Video call")
                        detail: callDetail, // Subtext (e.g. "28 min" or "Click to call back")
                        callType: callType,
                        type,
                        isMe: sender === 'You' || sender === 'Me' || sender.toLowerCase() === 'adisu',
                        attachmentName: null
                    };
                } else {
                    currentMessage = {
                        date,
                        time,
                        sender,
                        content: messageContent,
                        type,
                        isMe: sender === 'You' || sender === 'Me' || sender.toLowerCase() === 'adisu',
                        attachmentName
                    };
                }
            }
        } else {
            if (currentMessage) {
                currentMessage.content += '\n' + line;
            }
        }
    });

    if (currentMessage) {
        messages.push(currentMessage);
    }

    return messages;
}

function formatTime(rawTime, use24Hour) {
    if (!rawTime) return '';

    // Normalize input first. It could be "15:42" or "3:42 PM" or "3:42:05 PM"
    // Let's parse it into hours and minutes
    let hours, minutes, modifier;

    // Check for AM/PM
    const amPmMatch = rawTime.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s?([AP]M)/i);
    const twentyFourMatch = rawTime.match(/(\d{1,2}):(\d{2})(?::\d{2})?/); // Matches 15:42 or 15:42:56

    if (amPmMatch) {
        hours = parseInt(amPmMatch[1]);
        minutes = parseInt(amPmMatch[2]);
        modifier = amPmMatch[3].toUpperCase();

        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
    } else if (twentyFourMatch) {
        hours = parseInt(twentyFourMatch[1]);
        minutes = parseInt(twentyFourMatch[2]);
    } else {
        return rawTime; // Fallback
    }

    // Convert to desired format
    if (use24Hour) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    } else {
        const period = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        return `${hours}:${minutes.toString().padStart(2, '0')} ${period}`;
    }
}

function renderChat(messages, files = {}) {
    const container = document.getElementById('chatContainer');
    container.innerHTML = '';

    const use24Hour = document.getElementById('formatToggle').checked;
    const showDates = document.getElementById('showDateToggle').checked;

    // Default behaviors
    const showSenders = true;

    const senderColors = {};
    const colors = [
        '#e53935', '#d81b60', '#8e24aa', '#5e35b1', '#3949ab',
        '#1e88e5', '#039be5', '#00acc1', '#00897b', '#43a047',
        '#7cb342', '#c0ca33', '#fdd835', '#ffb300', '#fb8c00', '#f4511e'
    ];
    let colorIndex = 0;

    const getSenderColor = (sender) => {
        if (!senderColors[sender]) {
            senderColors[sender] = colors[colorIndex % colors.length];
            colorIndex++;
        }
        return senderColors[sender];
    };

    const fragment = document.createDocumentFragment();
    let lastDate = null;

    messages.forEach(msg => {
        // Date Separator
        if (showDates && msg.date && msg.date !== lastDate) {
            const dateDiv = document.createElement('div');
            dateDiv.className = 'date-separator';
            const dateSpan = document.createElement('span');
            dateSpan.textContent = msg.date;
            dateDiv.appendChild(dateSpan);
            fragment.appendChild(dateDiv);
            lastDate = msg.date;
        }

        const row = document.createElement('div');
        row.className = `message-row ${msg.type === 'system' ? 'system' : (msg.isMe ? 'sent' : 'received')}`;

        const bubble = document.createElement('div');
        bubble.className = `bubble ${msg.type === 'system' ? 'system-content' : (msg.isMe ? 'sent' : 'received')} ${msg.type === 'call' ? 'call-message' : ''}`;

        if (msg.type === 'system') {
            bubble.textContent = msg.content;
        } else {
            if (showSenders && !msg.isMe && msg.type !== 'call') {
                const senderName = document.createElement('span');
                senderName.className = 'sender-name';
                senderName.textContent = msg.sender;
                senderName.style.color = getSenderColor(msg.sender);
                bubble.appendChild(senderName);
            } else if (showSenders && !msg.isMe && msg.type === 'call') {
                const senderName = document.createElement('span');
                senderName.className = 'sender-name';
                senderName.textContent = msg.sender;
                senderName.style.color = getSenderColor(msg.sender);
                bubble.appendChild(senderName);
            }

            if (msg.type === 'image' && msg.attachmentName) {
                const imgSrc = files[msg.attachmentName];
                if (imgSrc) {
                    const img = document.createElement('img');
                    img.src = imgSrc;
                    bubble.appendChild(img);
                } else {
                    const placeholder = document.createElement('div');
                    placeholder.textContent = `📷 ${msg.attachmentName}`;
                    placeholder.style.fontStyle = 'italic';
                    placeholder.style.opacity = '0.7';
                    placeholder.style.marginBottom = '5px';
                    bubble.appendChild(placeholder);
                }
            } else if (msg.type === 'document') {
                // Document UI (like WhatsApp)
                const docContainer = document.createElement('div');
                docContainer.className = 'document-content';

                const docIcon = document.createElement('div');
                docIcon.className = 'document-icon';
                docIcon.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>`;

                const docInfo = document.createElement('div');
                docInfo.className = 'document-info';

                const docName = document.createElement('div');
                docName.className = 'document-name';
                docName.textContent = msg.attachmentName || 'Document';

                const docMeta = document.createElement('div');
                docMeta.className = 'document-meta-info';
                docMeta.textContent = 'Document not available';

                docInfo.appendChild(docName);
                docInfo.appendChild(docMeta);

                docContainer.appendChild(docIcon);
                docContainer.appendChild(docInfo);

                bubble.appendChild(docContainer);

            } else if (msg.type === 'call') {
                // Call UI
                const callContainer = document.createElement('div');
                callContainer.className = 'call-content';

                const icon = document.createElement('div');
                icon.className = 'call-icon';
                // Simple SVGs for icons
                if (msg.callType.includes('Video')) {
                    icon.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`;
                } else {
                    icon.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-2.2 2.2c-2.83-1.44-5.15-3.75-6.59-6.59l2.2-2.21c.28-.26.36-.65.25-1C8.7 6.33 8.5 5.13 8.5 3.9c0-.55-.45-1-1-1H3.5c-.55 0-1 .45-1 1 3.03 16.66 17.63 21.93 17.63 21.93.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1z"/></svg>`;
                }

                if (msg.callType.includes('Missed')) {
                    callContainer.classList.add('missed');
                }

                const textDiv = document.createElement('div');
                textDiv.className = 'call-text';

                const title = document.createElement('div');
                title.className = 'call-title';
                title.textContent = msg.content;

                const subtext = document.createElement('div');
                subtext.className = 'call-subtext';
                subtext.textContent = msg.detail;

                textDiv.appendChild(title);
                textDiv.appendChild(subtext);

                callContainer.appendChild(icon);
                callContainer.appendChild(textDiv);

                bubble.appendChild(callContainer);

            } else {
                const contentDiv = document.createElement('div');
                contentDiv.className = 'msg-content';
                contentDiv.textContent = msg.content;
                bubble.appendChild(contentDiv);
            }

            const metaDiv = document.createElement('div');
            metaDiv.className = 'msg-meta';
            metaDiv.textContent = formatTime(msg.time, use24Hour);

            // Add double ticks for sent messages
            if (msg.isMe) {
                const ticksSpan = document.createElement('span');
                ticksSpan.className = 'read-ticks';
                ticksSpan.innerHTML = `<svg viewBox="0 0 16 11" width="16" height="11" fill="currentColor"><path d="M11.07.33L4.93 6.66 1.94 3.67 0 5.61 4.93 11l8.15-8.67z"/><path d="M15.07.33L8.93 6.66 7.93 5.66 6 7.61 8.93 11l8.15-8.67z"/></svg>`;
                metaDiv.appendChild(ticksSpan);
            }

            bubble.appendChild(metaDiv);
        }

        row.appendChild(bubble);
        fragment.appendChild(row);
    });

    container.appendChild(fragment);
    container.scrollTop = container.scrollHeight;
}
