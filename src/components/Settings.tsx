import { useState, useEffect } from 'react';
import { api } from '../lib/api';

interface SettingsProps {
    onBack: () => void;
    currentUser: string;
    onUserChanged: (newName: string) => void;
}

export default function Settings({ onBack, currentUser, onUserChanged }: SettingsProps) {
    const [nameInput, setNameInput] = useState(currentUser);
    const [windowsName, setWindowsName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        // Fetch windows name for placeholder
        const fetchWindowsName = async () => {
            try {
                const osName = await api.getOsUsername();
                setWindowsName(osName);
            } catch (e) {
                console.error('Failed to get windows name:', e);
            }
        };
        fetchWindowsName();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const trimmed = nameInput.trim();
            if (trimmed) {
                await api.setUserDisplayName(trimmed);
                onUserChanged(trimmed);
            }
        } finally {
            setIsSaving(false);
            onBack();
        }
    };

    const handleClearName = async () => {
        setIsSaving(true);
        try {
            await api.setUserDisplayName(null);
            onUserChanged(windowsName);
            setNameInput(''); // visually clear
        } finally {
            setIsSaving(false);
            onBack();
        }
    };

    return (
        <div className="bg-brand-card rounded-xl shadow-sm border border-brand-border overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="p-1 -ml-1 text-brand-text-muted hover:text-brand-text-main transition rounded-md hover:bg-brand-bg disabled:opacity-50"
                        disabled={isSaving}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </button>
                    <h2 className="text-[18px] font-bold text-brand-text-main flex items-center gap-2">
                        <svg className="w-5 h-5 text-brand-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        設定
                    </h2>
                </div>
            </div>

            <div className="p-6">
                <div className="max-w-xl">
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-brand-text-main mb-2">
                            表示名
                        </label>
                        <input
                            type="text"
                            value={nameInput}
                            onChange={e => setNameInput(e.target.value)}
                            placeholder={windowsName || 'Windows ユーザー名'}
                            className="w-full border border-brand-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent"
                            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                            disabled={isSaving}
                            autoFocus
                        />
                        <p className="text-xs text-brand-text-muted mt-2 leading-relaxed">
                            Issue やコメントで表示される名前です。<br />
                            空欄にして「リセット」すると Windows のユーザー名（{windowsName}）に戻ります。
                        </p>
                    </div>

                    <div className="pt-6 border-t border-brand-border flex items-center justify-between">
                        <button
                            onClick={handleClearName}
                            className="text-sm text-brand-text-muted hover:text-red-600 transition"
                            disabled={isSaving}
                        >
                            リセット
                        </button>
                        <div className="flex gap-3">
                            <button
                                onClick={onBack}
                                className="px-4 py-2 border border-brand-border text-brand-text-main rounded-md text-sm font-medium hover:bg-gray-50 transition"
                                disabled={isSaving}
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-6 py-2 bg-brand-primary text-white rounded-md text-sm font-medium hover:bg-brand-primary/90 transition flex items-center gap-2"
                                disabled={isSaving}
                            >
                                {isSaving ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        保存中...
                                    </>
                                ) : (
                                    '保存'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
