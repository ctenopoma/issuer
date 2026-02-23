import { useState, useEffect, useRef } from 'react';
import IssueList from './components/IssueList';
import IssueDetail from './components/IssueDetail';
import NewIssue from './components/NewIssue';
import MilestoneProgress from './components/MilestoneProgress';
import Settings from './components/Settings';
import { api } from './lib/api';
import { FilterState } from './types';
import { listen } from '@tauri-apps/api/event';

type LockMode = 'edit' | 'readonly' | 'zombie' | 'loading';
type ViewType = 'LIST' | 'DETAIL' | 'NEW' | 'MILESTONE' | 'SETTINGS';

const FILTER_STORAGE_KEY = 'issuer-filter-state';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('LIST');
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [lockMode, setLockMode] = useState<LockMode>('loading');
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<string>('');
  const [showZombieDialog, setShowZombieDialog] = useState(false);
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

  // Startup: check lock status and display name
  useEffect(() => {
    const checkLock = async () => {
      let osName = '';
      try {
        const info = await api.getLockInfo();
        osName = info.display_name || info.current_user;
        setWindowsName(osName);
        setCurrentUser(osName);
        setLockedBy(info.locked_by);
        if (info.mode === 'zombie') {
          setLockMode('zombie');
          setShowZombieDialog(true);
        } else if (info.mode === 'readonly') {
          setLockMode('readonly');
        } else {
          setLockMode('edit');
        }
      } catch (e) {
        console.error('Failed to get lock info:', e);
        setLockMode('edit'); // fallback
      }

      // Check if custom display name is set (separate from lock check)
      try {
        const customName = await api.getUserDisplayName();
        if (customName) {
          setCurrentUser(customName);
        } else {
          // First launch: show name registration dialog
          setNameInput('');
          setShowNameDialog(true);
        }
      } catch (e) {
        console.error('Failed to get user display name:', e);
        // If the command fails, still show the dialog
        setShowNameDialog(true);
      }
    };
    checkLock();

    // Load saved filter from localStorage
    try {
      const stored = localStorage.getItem(FILTER_STORAGE_KEY);
      if (stored) {
        setSavedFilter(JSON.parse(stored));
      }
    } catch { /* ignore */ }

    // Listen for delta sync refresh events
    const unlisten = listen('refresh-data', () => {
      // We force a re-render or instruct children to fetch by sending a signal.
      // Easiest is to add a refreshKey state and pass it down, or just rely
      // on SWR/React Query if we had it. Since we don't, we'll use a refresh counter.
      setRefreshKey(prev => prev + 1);
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  // Heartbeat: update lock timestamp every 60s (edit mode only)
  useEffect(() => {
    if (lockMode !== 'edit') return;
    const interval = setInterval(async () => {
      try {
        await api.updateHeartbeat();
      } catch (e) {
        console.error('Heartbeat failed:', e);
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [lockMode]);

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

  const handleForceAcquire = async () => {
    try {
      await api.forceAcquireLock();
      setLockMode('edit');
      setLockedBy(null);
      setShowZombieDialog(false);
    } catch (e) {
      console.error('Failed to force acquire lock:', e);
      alert('ロックの強制解除に失敗しました。');
    }
  };

  const handleOpenReadonly = () => {
    setLockMode('readonly');
    setShowZombieDialog(false);
  };

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

  const isReadonly = lockMode === 'readonly';

  // Lock status indicator for AppBar
  const lockIndicator = () => {
    switch (lockMode) {
      case 'edit':
        return (
          <span className="text-sm font-medium text-brand-open flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-open animate-pulse"></span>
            編集モード
          </span>
        );
      case 'readonly':
        return (
          <span className="text-sm font-medium text-amber-600 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            閲覧のみ{lockedBy ? ` (${lockedBy} がロック中)` : ''}
          </span>
        );
      case 'loading':
        return (
          <span className="text-sm font-medium text-brand-text-muted flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-400 animate-pulse"></span>
            確認中...
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text-main">
      <header className="bg-brand-card shadow-sm px-6 py-3 flex items-center justify-between border-b border-brand-border">
        <h1 className="text-[20px] font-bold text-brand-text-main cursor-pointer" onClick={() => navigateTo('LIST')}>
          Issue管理画面
        </h1>
        <div className="flex items-center gap-4">
          {lockIndicator()}
          <div className="h-4 w-px bg-brand-border mx-1"></div>
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

      {/* Readonly banner */}
      {isReadonly && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-amber-800 text-sm flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
          <span>
            <strong>{lockedBy}</strong> が編集中のため、閲覧のみモードで開いています。変更は保存できません。
          </span>
        </div>
      )}

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

      {/* Name Registration Dialog (first launch) */}
      {showZombieDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-brand-card rounded-xl shadow-2xl max-w-md w-full mx-4 p-0 overflow-hidden">
            {/* Header */}
            <div className="bg-amber-50 border-b border-amber-200 px-6 py-4">
              <h2 className="text-lg font-bold text-amber-900 flex items-center gap-2">
                <svg className="w-6 h-6 text-amber-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                編集ロックが長時間保持されています
              </h2>
            </div>
            {/* Body */}
            <div className="px-6 py-5">
              <p className="text-brand-text-main text-[15px] leading-relaxed">
                <strong>{lockedBy}</strong> によるロックが 1 時間以上更新されていません。
              </p>
              <p className="text-brand-text-muted text-[14px] mt-2">
                強制解除して編集するか、閲覧のみで開くことができます。
              </p>
            </div>
            {/* Actions */}
            <div className="px-6 py-4 bg-gray-50 border-t border-brand-border flex justify-end gap-3">
              <button
                onClick={handleOpenReadonly}
                className="border border-brand-border bg-brand-card text-brand-text-main px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-100 transition shadow-sm"
              >
                閲覧のみで開く
              </button>
              <button
                onClick={handleForceAcquire}
                className="bg-brand-primary text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition shadow-sm"
              >
                強制解除して編集
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
