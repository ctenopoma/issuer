import { useState, useEffect, useRef } from 'react';
import IssueList from './components/IssueList';
import IssueDetail from './components/IssueDetail';
import NewIssue from './components/NewIssue';
import MilestoneProgress from './components/MilestoneProgress';
import { api } from './lib/api';
import { FilterState } from './types';

type LockMode = 'edit' | 'readonly' | 'zombie' | 'loading';
type ViewType = 'LIST' | 'DETAIL' | 'NEW' | 'MILESTONE';

const FILTER_STORAGE_KEY = 'issuer-filter-state';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('LIST');
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [lockMode, setLockMode] = useState<LockMode>('loading');
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [showZombieDialog, setShowZombieDialog] = useState(false);
  const [savedFilter, setSavedFilter] = useState<FilterState | null>(null);
  const viewRef = useRef(currentView);
  viewRef.current = currentView;

  const navigateTo = (view: ViewType, issueId?: number) => {
    setCurrentView(view);
    if (issueId !== undefined) {
      setSelectedIssueId(issueId);
    }
  };

  // Startup: check lock status
  useEffect(() => {
    const checkLock = async () => {
      try {
        const info = await api.getLockInfo();
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
    };
    checkLock();

    // Load saved filter from localStorage
    try {
      const stored = localStorage.getItem(FILTER_STORAGE_KEY);
      if (stored) {
        setSavedFilter(JSON.parse(stored));
      }
    } catch { /* ignore */ }
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
            onSelectIssue={(id) => navigateTo('DETAIL', id)}
            onNewIssue={() => navigateTo('NEW')}
            onShowMilestoneProgress={() => navigateTo('MILESTONE')}
            savedFilter={savedFilter}
            onSaveFilter={handleSaveFilter}
          />
        )}
        {currentView === 'DETAIL' && selectedIssueId && (
          <IssueDetail
            issueId={selectedIssueId}
            onBack={() => navigateTo('LIST')}
            onNavigateToIssue={(id) => navigateTo('DETAIL', id)}
          />
        )}
        {currentView === 'NEW' && (
          <NewIssue
            onCancel={() => navigateTo('LIST')}
            onCreated={(id) => navigateTo('DETAIL', id)}
          />
        )}
        {currentView === 'MILESTONE' && (
          <MilestoneProgress
            onBack={() => navigateTo('LIST')}
            onSelectMilestone={handleMilestoneSelect}
          />
        )}
      </main>

      {/* Zombie Lock Dialog (modal overlay) */}
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
