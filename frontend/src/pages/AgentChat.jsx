import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, User, Send, Sparkles, Wrench, ChevronDown, ChevronRight, Globe, Trash2, Plus, Loader2 } from 'lucide-react';
import { streamAgentChat, getAgentTools } from '../api/client';
import styles from './AgentChat.module.css';

const BOT_NAME = 'Gemini-3.1-Pro';

const quickPrompts = [
    '帮我解读差异分析结果',
    '如何设置差异分析阈值？',
    '解释聚类结果中的轮廓系数',
    '推荐单细胞分析流程',
    '如何处理批次效应？',
    '读取 https://www.ncbi.nlm.nih.gov/ 的内容',
];

/* ── Markdown-like rendering ─────── */
function renderMarkdown(text) {
    if (!text) return null;
    const lines = text.split('\n');
    const elements = [];
    let inCodeBlock = false;
    let codeLines = [];
    let codeLang = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('```')) {
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeLang = line.slice(3).trim();
                codeLines = [];
            } else {
                elements.push(
                    <pre key={`code-${i}`} className={styles.codeBlock}>
                        <code>{codeLines.join('\n')}</code>
                    </pre>
                );
                inCodeBlock = false;
            }
            continue;
        }

        if (inCodeBlock) {
            codeLines.push(line);
            continue;
        }

        // Headers
        if (line.startsWith('### ')) {
            elements.push(<h4 key={i} className={styles.mdH4}>{line.slice(4)}</h4>);
        } else if (line.startsWith('## ')) {
            elements.push(<h3 key={i} className={styles.mdH3}>{line.slice(3)}</h3>);
        } else if (line.startsWith('# ')) {
            elements.push(<h2 key={i} className={styles.mdH2}>{line.slice(2)}</h2>);
        }
        // List items
        else if (line.match(/^[\-\*•]\s/)) {
            elements.push(
                <div key={i} className={styles.mdListItem}>
                    <span className={styles.mdBullet}>•</span>
                    <span>{formatInline(line.slice(2))}</span>
                </div>
            );
        }
        // Numbered list
        else if (line.match(/^\d+\.\s/)) {
            const num = line.match(/^(\d+)\./)[1];
            elements.push(
                <div key={i} className={styles.mdListItem}>
                    <span className={styles.mdNum}>{num}.</span>
                    <span>{formatInline(line.slice(num.length + 2))}</span>
                </div>
            );
        }
        // Normal paragraph
        else if (line.trim()) {
            elements.push(<p key={i} className={styles.mdPara}>{formatInline(line)}</p>);
        } else {
            elements.push(<div key={i} className={styles.mdSpacer} />);
        }
    }

    return elements;
}

function formatInline(text) {
    // Bold **text**
    const parts = [];
    const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)/g;
    let last = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match.index > last) {
            parts.push(text.slice(last, match.index));
        }
        if (match[2]) {
            parts.push(<strong key={match.index}>{match[2]}</strong>);
        } else if (match[4]) {
            parts.push(<code key={match.index} className={styles.inlineCode}>{match[4]}</code>);
        }
        last = match.index + match[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts.length > 0 ? parts : text;
}

/* ── Tool Call Card ─────────────── */
function ToolCallCard({ toolCall }) {
    const [expanded, setExpanded] = useState(false);
    const hasResult = toolCall.result != null;

    return (
        <div className={styles.toolCard}>
            <div className={styles.toolCardHeader} onClick={() => setExpanded(!expanded)}>
                <div className={styles.toolCardIcon}>
                    {toolCall.name === 'read_webpage' ? <Globe size={14} /> : <Wrench size={14} />}
                </div>
                <span className={styles.toolCardName}>{toolCall.name}</span>
                <span className={styles.toolCardStatus}>
                    {hasResult ? (toolCall.result?.success !== false ? '✓ 完成' : '✗ 失败') : '⏳ 执行中...'}
                </span>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
            {expanded && (
                <div className={styles.toolCardBody}>
                    <div className={styles.toolCardSection}>
                        <span className={styles.toolCardLabel}>参数</span>
                        <pre className={styles.toolCardPre}>{JSON.stringify(toolCall.arguments, null, 2)}</pre>
                    </div>
                    {hasResult && (
                        <div className={styles.toolCardSection}>
                            <span className={styles.toolCardLabel}>结果</span>
                            <pre className={styles.toolCardPre}>
                                {typeof toolCall.result === 'string'
                                    ? toolCall.result
                                    : JSON.stringify(toolCall.result, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/* ── Message Bubble ────────────── */
function MessageBubble({ msg }) {
    if (msg.role === 'tool') {
        return <ToolCallCard toolCall={msg.toolData} />;
    }

    return (
        <div className={`${styles.message} ${msg.role === 'assistant' ? styles.messageBot : styles.messageUser}`}>
            <div className={styles.messageAvatar}>
                {msg.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
            </div>
            <div className={styles.messageBubble}>
                {msg.role === 'assistant' ? renderMarkdown(msg.content) : (
                    msg.content.split('\n').map((line, j) => (
                        <span key={j}>{line}<br /></span>
                    ))
                )}
            </div>
        </div>
    );
}

/* ── Conversation Storage ──────── */
const STORAGE_KEY = 'bioinsight_agent_conversations';

function loadConversations() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveConversations(convos) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(convos.map(c => ({
            ...c,
            messages: c.messages.filter(m => m.role !== 'tool'),  // Don't persist tool cards
        }))));
    } catch {}
}

/* ── Main Component ────────────── */
export default function AgentChat() {
    const [conversations, setConversations] = useState(() => loadConversations());
    const [activeId, setActiveId] = useState(() => {
        const convos = loadConversations();
        return convos.length > 0 ? convos[0].id : null;
    });
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const messagesEndRef = useRef(null);
    const abortRef = useRef(null);
    const inputRef = useRef(null);

    // Active conversation
    const activeConvo = conversations.find(c => c.id === activeId);
    const messages = activeConvo?.messages || [];

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Save conversations to localStorage
    useEffect(() => {
        if (conversations.length > 0) {
            saveConversations(conversations);
        }
    }, [conversations]);

    const updateMessages = useCallback((convoId, updater) => {
        setConversations(prev => prev.map(c =>
            c.id === convoId ? { ...c, messages: updater(c.messages) } : c
        ));
    }, []);

    const createConversation = useCallback(() => {
        const newConvo = {
            id: Date.now().toString(),
            title: '新对话',
            messages: [],
            createdAt: new Date().toISOString(),
        };
        setConversations(prev => [newConvo, ...prev]);
        setActiveId(newConvo.id);
        return newConvo.id;
    }, []);

    const deleteConversation = useCallback((id) => {
        setConversations(prev => {
            const next = prev.filter(c => c.id !== id);
            if (activeId === id) {
                setActiveId(next.length > 0 ? next[0].id : null);
            }
            return next;
        });
    }, [activeId]);

    const handleSend = useCallback(async (overrideInput) => {
        const text = (overrideInput || input).trim();
        if (!text || isStreaming) return;

        let convoId = activeId;
        if (!convoId) {
            convoId = createConversation();
        }

        setInput('');
        setIsStreaming(true);

        // Add user message
        const userMsg = { role: 'user', content: text };
        updateMessages(convoId, prev => [...prev, userMsg]);

        // Update title from first message
        setConversations(prev => prev.map(c =>
            c.id === convoId && c.title === '新对话'
                ? { ...c, title: text.length > 20 ? text.slice(0, 20) + '...' : text }
                : c
        ));

        // Prepare messages for API (user + assistant only)
        const apiMessages = [...(conversations.find(c => c.id === convoId)?.messages || []), userMsg]
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role, content: m.content }));

        // Add streaming assistant message
        const assistantMsgId = Date.now();
        updateMessages(convoId, prev => [...prev, { role: 'assistant', content: '', id: assistantMsgId }]);

        let fullText = '';

        const controller = streamAgentChat(apiMessages, BOT_NAME, {
            onToken: (token) => {
                fullText += token;
                // Clean tool call markers from displayed text
                const cleanText = fullText
                    .replace(/\[TOOL_CALL\].*?\[\/TOOL_CALL\]/gs, '')
                    .replace(/^\s+/, ''); // only trim leading whitespace
                updateMessages(convoId, prev =>
                    prev.map(m => m.id === assistantMsgId ? { ...m, content: cleanText } : m)
                );
            },
            onReplace: (text) => {
                fullText = text;
                const cleanText = fullText
                    .replace(/\[TOOL_CALL\].*?\[\/TOOL_CALL\]/gs, '')
                    .replace(/^\s+/, '');
                updateMessages(convoId, prev =>
                    prev.map(m => m.id === assistantMsgId ? { ...m, content: cleanText } : m)
                );
            },
            onToolCall: (data) => {
                updateMessages(convoId, prev => [
                    ...prev,
                    { role: 'tool', toolData: { name: data.name, arguments: data.arguments, result: null } }
                ]);
            },
            onToolResult: (data) => {
                updateMessages(convoId, prev =>
                    prev.map(m => {
                        if (m.role === 'tool' && m.toolData?.name === data.name && m.toolData?.result === null) {
                            return { ...m, toolData: { ...m.toolData, result: data.result } };
                        }
                        return m;
                    })
                );
            },
            onDone: () => {
                setIsStreaming(false);
            },
            onError: (err) => {
                updateMessages(convoId, prev => [
                    ...prev,
                    { role: 'assistant', content: `❌ 错误: ${err}` }
                ]);
                setIsStreaming(false);
            },
        });

        abortRef.current = controller;
    }, [input, isStreaming, activeId, conversations, createConversation, updateMessages]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleQuickPrompt = (prompt) => {
        setInput(prompt);
        setTimeout(() => handleSend(prompt), 0);
    };

    const handleStop = () => {
        abortRef.current?.abort();
        setIsStreaming(false);
    };

    const showWelcome = !activeConvo || messages.length === 0;

    return (
        <div className={styles.page}>
            <h2 className="page-title">AI Agent</h2>
            <p className="page-subtitle">与 AI 助手对话，辅助分析和结果解读</p>

            <div className={styles.chatContainer}>
                {/* History Panel */}
                <div className={styles.historyPanel}>
                    <div className={styles.historyHeader}>
                        <span className={styles.historyTitle}>历史会话</span>
                        <button className={styles.newChatBtn} onClick={createConversation} title="新对话">
                            <Plus size={14} />
                        </button>
                    </div>
                    <div className={styles.historyList}>
                        {conversations.map((convo) => (
                            <div
                                key={convo.id}
                                className={`${styles.historyItem} ${activeId === convo.id ? styles.active : ''}`}
                                onClick={() => setActiveId(convo.id)}
                            >
                                <span className={styles.historyItemText}>{convo.title}</span>
                                <button
                                    className={styles.deleteBtn}
                                    onClick={(e) => { e.stopPropagation(); deleteConversation(convo.id); }}
                                    title="删除"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                        {conversations.length === 0 && (
                            <div className={styles.emptyHistory}>暂无会话记录</div>
                        )}
                    </div>
                </div>

                {/* Chat Panel */}
                <div className={styles.chatPanel}>
                    <div className={styles.messagesArea}>
                        {showWelcome && (
                            <div className={styles.welcomeSection}>
                                <div className={styles.welcomeIcon}>
                                    <Sparkles size={32} />
                                </div>
                                <h3 className={styles.welcomeTitle}>BioInsight AI 助手</h3>
                                <p className={styles.welcomeDesc}>
                                    我可以帮助你解读分析结果、提供实验建议、读取网页文献，还可以调用平台的分析工具。
                                </p>
                                <div className={styles.quickPrompts}>
                                    {quickPrompts.map((prompt) => (
                                        <button
                                            key={prompt}
                                            className={styles.promptBtn}
                                            onClick={() => handleQuickPrompt(prompt)}
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <MessageBubble key={msg.id || i} msg={msg} />
                        ))}

                        {isStreaming && (
                            <div className={styles.typingIndicator}>
                                <div className={styles.typingDot} />
                                <div className={styles.typingDot} />
                                <div className={styles.typingDot} />
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    <div className={styles.inputArea}>
                        <textarea
                            ref={inputRef}
                            className={styles.chatInput}
                            placeholder="输入你的问题...（按 Enter 发送，Shift+Enter 换行）"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={1}
                            disabled={isStreaming}
                        />
                        {isStreaming ? (
                            <button className={styles.stopBtn} onClick={handleStop}>
                                <Loader2 size={16} className={styles.spinIcon} /> 停止
                            </button>
                        ) : (
                            <button
                                className={styles.sendBtn}
                                onClick={() => handleSend()}
                                disabled={!input.trim()}
                            >
                                <Send size={16} /> 发送
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
