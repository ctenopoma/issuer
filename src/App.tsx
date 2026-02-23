import { useState, useEffect, useRef } from 'react';
import IssueList from './components/IssueList';
import IssueDetail from './components/IssueDetail';
import NewIssue from './components/NewIssue';
import MilestoneProgress from './components/MilestoneProgress';
import Settings from './components/Settings';
import { api } from './lib/api';
import { FilterState } from './types';
import { listen } from '@tauri-apps/api/event';

type ViewType = 'LIST' | 'DETAIL' | 'NEW' | 'MILESTONE' | 'SETTINGS';

const FILTER_STORAGE_KEY = 'issuer-filter-state';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('LIST');
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<string>('');
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [windowsName, setWindowsName] = useState('');
  const [savedFilter, setSavedFilter] = useState<FilterState | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const viewRef = useRef(currentView);
  viewRef.current = currentView;

  const navigateTo = (view: ViewType, issueId?: number) => {
    setCurrentView(view);
    if (issueId !== undefined) {
      setSelectedIssueId(issueId);
    }
  };

  // Startup: initialize user display name
  useEffect(() => {
    const init = async () => {
      try {
        const osName = await api.getOsUsername();
        setWindowsName(osName);
        setCurrentUser(osName);

        const customName = await api.getUserDisplayName();
        if (customName) {
          setCurrentUser(customName);
        } else {
          // First launch: show name registration dialog
          setNameInput('');
          setShowNameDialog(true);
        }
      } catch (e) {
        console.error('Failed to initialize:', e);
        setShowNameDialog(true);
      }
    };
    init();

    // Load saved filter from localStorage
    try {
      const stored = localStorage.getItem(FILTER_STORAGE_KEY);
      if (stored) {
        setSavedFilter(JSON.parse(stored));
      }
    } catch { /* ignore */ }

    // Listen for delta sync refresh events
    const unlisten = listen('refresh-data', () => {
      setRefreshKey(prev => prev + 1);
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  // マウスの「戻る」ボタン (XButton1, button=3) で一覧に戻る
  useEffect(() => {
    const handleMouseBack = (e: MouseEvent) => {
      if (e.button === 3 && viewRef.current !== 'LIST') {
        e.preventDefault();
        e.stopPropagation();
        setCurrentView('LIST');
      }
    };
    const handleAuxClick = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
      }
    };
    window.addEventListener('mousedown', handleMouseBack);
    window.addEventListener('auxclick', handleAuxClick);
    return () => {
      window.removeEventListener('mousedown', handleMouseBack);
      window.removeEventListener('auxclick', handleAuxClick);
    };
  }, []);

  const handleSaveFilter = (filter: FilterState) => {
    setSavedFilter(filter);
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filter));
    } catch { /* ignore */ }
  };

  const handleMilestoneSelect = (milestoneId: number) => {
    // Navigate to list with milestone filter
    const filter: FilterState = {
      keyword: '',
      assignee: '',
      tagsText: '',
      currentTab: 'ALL',
      milestoneId,
    };
    setSavedFilter(filter);
    setCurrentView('LIST');
  };

  const handleRegisterName = async () => {
    const trimmed = nameInput.trim();
    if (trimmed) {
      await api.setUserDisplayName(trimmed);
      setCurrentUser(trimmed);
    }
    setShowNameDialog(false);
  };

  const handleSkipName = () => {
    setShowNameDialog(false);
  };

  const handleOpenSettings = () => {
    setCurrentView('SETTINGS');
  };

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text-main">
      <header className="bg-brand-card shadow-sm px-6 py-3 flex items-center justify-between border-b border-brand-border">
        <h1 className="text-[20px] font-bold text-brand-text-main cursor-pointer" onClick={() => navigateTo('LIST')}>
          Issue管理画面
        </h1>
        <div className="flex items-center gap-4">
          {currentUser && (
            <div className="text-sm text-brand-text-muted flex items-center gap-1.5" title="現在の表示名">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {currentUser}
            </div>
          )}
          <button
            onClick={handleOpenSettings}
            className={`p-1.5 rounded-md transition ${currentView === 'SETTINGS' ? 'bg-brand-primary/10 text-brand-primary' : 'text-brand-text-muted hover:bg-brand-bg hover:text-brand-text-main'}`}
            title="設定"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="max-w-[980px] mx-auto py-6 px-6">
        {currentView === 'LIST' && (
          <IssueList
            key={`list-${refreshKey}`}
            onSelectIssue={(id) => navigateTo('DETAIL', id)}
            onNewIssue={() => navigateTo('NEW')}
            onShowMilestoneProgress={() => navigateTo('MILESTONE')}
            savedFilter={savedFilter}
            onSaveFilter={handleSaveFilter}
          />
        )}
        {currentView === 'DETAIL' && selectedIssueId && (
          <IssueDetail
            key={`detail-${selectedIssueId}-${refreshKey}`}
            issueId={selectedIssueId}
            onBack={() => navigateTo('LIST')}
            onNavigateToIssue={(id) => navigateTo('DETAIL', id)}
            currentUser={currentUser}
          />
        )}
        {currentView === 'NEW' && (
          <NewIssue
            onCancel={() => navigateTo('LIST')}
            onCreated={(id: number) => navigateTo('DETAIL', id)}
            currentUser={currentUser}
          />
        )}
        {currentView === 'MILESTONE' && (
          <MilestoneProgress
            key={`milestone-${refreshKey}`}
            onBack={() => navigateTo('LIST')}
            onSelectMilestone={handleMilestoneSelect}
          />
        )}
        {currentView === 'SETTINGS' && (
          <Settings
            currentUser={currentUser}
            onUserChanged={setCurrentUser}
            onBack={() => navigateTo('LIST')}
          />
        )}
      </main>

      {/* Name Registration Dialog (first launch) */}
      {showNameDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-brand-card rounded-xl shadow-2xl max-w-md w-full mx-4 p-0 overflow-hidden">
            <div className="bg-blue-50 border-b border-blue-200 px-6 py-4">
              <h2 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                表示名の登録
              </h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-brand-text-main text-[15px] leading-relaxed mb-4">
                Issue に表示される名前を登録してください。スキップすると Windows のユーザー名（<strong>{windowsName}</strong>）が使用されます。
              </p>
              <input
                type="text"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                placeholder={windowsName}
                className="w-full border border-brand-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent"
                onKeyDown={e => { if (e.key === 'Enter') handleRegisterName(); }}
                autoFocus
              />
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-brand-border flex justify-end gap-3">
              <button
                onClick={handleSkipName}
                className="border border-brand-border bg-brand-card text-brand-text-main px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-100 transition shadow-sm"
              >
                スキップ
              </button>
              <button
                onClick={handleRegisterName}
                className="bg-brand-primary text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition shadow-sm"
              >
                登録
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
