import { useState } from 'react';
import { Bot, User, Send, Sparkles, Info } from 'lucide-react';
import styles from './AgentChat.module.css';

const sampleHistory = [
    { id: 1, title: '差异分析结果解读' },
    { id: 2, title: 'PCA 图含义说明' },
    { id: 3, title: '实验设计建议' },
];

const quickPrompts = [
    '帮我解读这个火山图',
    '如何设置差异分析阈值？',
    '解释聚类结果中的轮廓系数',
    '推荐单细胞分析流程',
    '如何处理批次效应？',
];

const welcomeMessages = [
    {
        role: 'bot',
        content: '你好！我是 BioInsight AI 助手 🧬\n\n我可以帮助你：\n• 解读差异分析和聚类结果\n• 提供实验设计建议\n• 解答生物信息学问题\n• 辅助文献调研\n\n该功能即将上线，敬请期待！',
    },
];

export default function AgentChat() {
    const [messages] = useState(welcomeMessages);
    const [input, setInput] = useState('');
    const [activeHistory, setActiveHistory] = useState(null);

    return (
        <div className={styles.page}>
            <h2 className="page-title">AI Agent</h2>
            <p className="page-subtitle">与 AI 助手对话，辅助分析和结果解读</p>

            <div className={styles.chatContainer}>
                {/* History Panel */}
                <div className={styles.historyPanel}>
                    <div className={styles.historyTitle}>历史会话</div>
                    <div className={styles.historyList}>
                        {sampleHistory.map((item) => (
                            <div
                                key={item.id}
                                className={`${styles.historyItem} ${activeHistory === item.id ? styles.active : ''}`}
                                onClick={() => setActiveHistory(item.id)}
                            >
                                {item.title}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Chat Panel */}
                <div className={styles.chatPanel}>
                    <div className={styles.messagesArea}>
                        <div className={styles.comingSoonBanner}>
                            <Sparkles size={16} />
                            <span>AI Agent 功能正在开发中，即将上线。以下为界面预览。</span>
                        </div>

                        {messages.map((msg, i) => (
                            <div key={i} className={`${styles.message} ${msg.role === 'bot' ? styles.messageBot : styles.messageUser}`}>
                                <div className={styles.messageAvatar}>
                                    {msg.role === 'bot' ? <Bot size={16} /> : <User size={16} />}
                                </div>
                                <div className={styles.messageBubble}>
                                    {msg.content.split('\n').map((line, j) => (
                                        <span key={j}>{line}<br /></span>
                                    ))}
                                </div>
                            </div>
                        ))}

                        <div className={styles.quickPrompts}>
                            {quickPrompts.map((prompt) => (
                                <button
                                    key={prompt}
                                    className={styles.promptBtn}
                                    onClick={() => setInput(prompt)}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={styles.inputArea}>
                        <input
                            className={styles.chatInput}
                            placeholder="输入你的问题... (功能即将上线)"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                        />
                        <button className={styles.sendBtn} disabled>
                            <Send size={16} /> 发送
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
