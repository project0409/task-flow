/**
 * Taskflow Team Meetings & Video Collaboration Module — Redesigned Interactive UI
 * Full Enterprise Conferencing:
 * - Admin/Lead: Schedule, Quick Instant Huddle, Cancel/Delete, Squad Filtering
 * - Employee: Squad & Company Meetings, Live Join, Copy Link, Relative Timers
 * - Interactive Video Stage: Screen Share, Raise Hand, Mic/Cam toggles, In-Room Chat, Reaction Emojis
 * - Direct Jitsi Meet integration
 */

const TaskflowMeetings = {
  meetings: [],
  filtered: [],
  activeMeeting: null,
  callTimer: null,
  callSeconds: 0,
  isMicMuted: false,
  isVideoOff: false,
  isScreenSharing: false,
  isHandRaised: false,
  activeFilter: 'all',
  squadFilter: 'all',
  searchQuery: '',
  activeDrawerTab: 'chat',

  async init() {
    this.bindDOM();
    await this.loadMeetings();
  },

  bindDOM() {
    // ── 1. Schedule Meeting Modal ──────────────────────────────────────────
    const btnOpenSched = document.getElementById('btn-open-schedule-meeting');
    const modalSched   = document.getElementById('modal-schedule-meeting');
    const btnCloseSched = document.getElementById('btn-close-schedule-modal');
    const formSched    = document.getElementById('form-schedule-meeting');

    if (btnOpenSched && modalSched) {
      btnOpenSched.addEventListener('click', () => {
        const schedInput = document.getElementById('meeting-sched-time');
        if (schedInput) {
          const d = new Date(Date.now() + 10 * 60 * 1000);
          schedInput.value = d.toISOString().slice(0, 16);
        }
        modalSched.showModal();
      });
    }

    if (btnCloseSched && modalSched) {
      btnCloseSched.addEventListener('click', () => modalSched.close());
    }

    if (formSched && modalSched) {
      formSched.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleCreateMeeting(formSched, modalSched);
      });
    }

    // ── 2. Instant Huddle Button (Admin / Lead) ───────────────────────────
    const btnHuddle = document.getElementById('btn-quick-huddle');
    if (btnHuddle) {
      btnHuddle.addEventListener('click', () => this.handleInstantHuddle());
    }

    // ── 3. Refresh Button ──────────────────────────────────────────────────
    const btnRefresh = document.getElementById('btn-refresh-meetings');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', async () => {
        btnRefresh.disabled = true;
        btnRefresh.style.opacity = '0.6';
        await this.loadMeetings();
        setTimeout(() => {
          btnRefresh.disabled = false;
          btnRefresh.style.opacity = '1';
        }, 700);
      });
    }

    // ── 4. Filter Tabs ────────────────────────────────────────────────────
    const filterTabsEl = document.getElementById('meetings-filter-tabs');
    if (filterTabsEl) {
      filterTabsEl.addEventListener('click', (e) => {
        const tab = e.target.closest('.meet-filter-tab');
        if (!tab) return;
        filterTabsEl.querySelectorAll('.meet-filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeFilter = tab.dataset.filter;
        this.applyFilters();
      });
    }

    // ── 5. Search Bar & Clear ─────────────────────────────────────────────
    const searchInput = document.getElementById('meetings-search-input');
    const searchClear = document.getElementById('meetings-search-clear');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        if (searchClear) {
          searchClear.style.display = this.searchQuery ? 'inline-block' : 'none';
        }
        this.applyFilters();
      });
    }

    if (searchClear && searchInput) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        searchClear.style.display = 'none';
        this.applyFilters();
        searchInput.focus();
      });
    }

    // ── 6. Squad Select Filter ────────────────────────────────────────────
    const squadFilterSelect = document.getElementById('meetings-squad-filter');
    if (squadFilterSelect) {
      squadFilterSelect.addEventListener('change', (e) => {
        this.squadFilter = e.target.value;
        this.applyFilters();
      });
    }

    // ── 7. Active Meeting Room Controls ───────────────────────────────────
    const btnLeave     = document.getElementById('btn-leave-meeting');
    const btnToggleMic = document.getElementById('btn-meeting-toggle-mic');
    const btnToggleCam = document.getElementById('btn-meeting-toggle-cam');
    const btnCopyRoomLink = document.getElementById('btn-room-copy-link');

    if (btnLeave)     btnLeave.addEventListener('click', () => this.leaveMeetingRoom());
    if (btnToggleMic) btnToggleMic.addEventListener('click', () => this.toggleMicrophone());
    if (btnToggleCam) btnToggleCam.addEventListener('click', () => this.toggleCamera());

    if (btnCopyRoomLink) {
      btnCopyRoomLink.addEventListener('click', () => {
        if (!this.activeMeeting) return;
        const link = this.activeMeeting.meeting_link || window.location.href;
        navigator.clipboard.writeText(link).then(() => {
          const txt = document.getElementById('room-copy-text');
          if (txt) {
            const orig = txt.textContent;
            txt.textContent = '✓ Copied!';
            setTimeout(() => { txt.textContent = orig; }, 2000);
          }
        }).catch(() => {
          alert(`Meeting Link: ${link}`);
        });
      });
    }

    // ── 8. In-Call Keyboard Shortcuts (M: Mute, V: Video, H: Hand) ───────
    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('modal-active-meeting-room');
      if (!modal || !modal.open) return;

      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        this.toggleMicrophone();
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        this.toggleCamera();
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        this.toggleRaiseHand();
      }
    });
  },

  // ── Load meetings from API ───────────────────────────────────────────────
  async loadMeetings() {
    const container = document.getElementById('meetings-list-container');
    if (!container) return;

    container.innerHTML = `<div class="meetings-loading">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite; display:inline-block; color:var(--color-brand-primary, #2E7D32);">
        <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
      <p style="margin-top:12px; font-weight:600;">Loading scheduled sessions...</p>
    </div>`;

    try {
      const res = await fetch('/api/meetings');
      if (!res.ok) return;
      const data = await res.json();
      this.meetings = data.meetings || [];
      this.updateAdminControls();
      this.updateStats();
      this.applyFilters();
    } catch (err) {
      console.error('[Meetings] Load failed:', err);
      container.innerHTML = `<div class="meetings-empty-state">
        <div style="font-size:42px;">⚠️</div>
        <h4>Failed to Load Meetings</h4>
        <p>Could not connect to the meetings service. Please check your connection and try refreshing.</p>
        <button type="button" class="btn primary" onclick="TaskflowMeetings.loadMeetings()" style="margin-top:14px;">Retry</button>
      </div>`;
    }
  },

  // ── Admin vs Employee Controls & Badges ──────────────────────────────────
  updateAdminControls() {
    const user = window.TaskflowAuth?.currentUser || {};
    const isAdmin = user.role === 'Admin' || user.is_admin;
    const isLead  = user.role === 'Lead';
    const isPrivileged = isAdmin || isLead;

    // Header role pill
    const rolePill = document.getElementById('meetings-role-pill');
    if (rolePill) {
      if (isAdmin) {
        rolePill.textContent = 'Admin Command';
        rolePill.style.background = 'rgba(239, 68, 68, 0.25)';
        rolePill.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      } else if (isLead) {
        rolePill.textContent = 'Squad Lead Host';
        rolePill.style.background = 'rgba(59, 130, 246, 0.25)';
        rolePill.style.borderColor = 'rgba(59, 130, 246, 0.4)';
      } else {
        rolePill.textContent = user.team_id ? 'Squad Workspace' : 'Employee Workspace';
      }
    }

    // Schedule and Quick Huddle buttons
    const btnSchedule = document.getElementById('btn-open-schedule-meeting');
    const btnHuddle   = document.getElementById('btn-quick-huddle');

    if (btnSchedule) {
      btnSchedule.style.display = isPrivileged ? 'inline-flex' : 'none';
    }
    if (btnHuddle) {
      btnHuddle.style.display = isPrivileged ? 'inline-flex' : 'none';
    }
  },

  // ── Update Summary Stats & Counts ────────────────────────────────────────
  updateStats() {
    const total     = this.meetings.length;
    const live      = this.meetings.filter(m => m.status === 'Live').length;
    const scheduled = this.meetings.filter(m => m.status === 'Scheduled').length;
    const avgDur    = total
      ? Math.round(this.meetings.reduce((a, m) => a + (m.duration_minutes || 0), 0) / total)
      : 0;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('meet-stat-total', total);
    set('meet-stat-live', live);
    set('meet-stat-scheduled', scheduled);
    set('meet-stat-duration', avgDur ? `${avgDur} min` : '—');

    // Tab count badges
    set('tab-cnt-all', total);
    set('tab-cnt-live', live);
    set('tab-cnt-sched', scheduled);

    // Sidebar Nav Badge
    const navBadge = document.getElementById('badge-meetings');
    if (navBadge) {
      if (live > 0) {
        navBadge.textContent = `${live} Live`;
        navBadge.className = 'badge green pulse';
        navBadge.style.background = 'rgba(239, 68, 68, 0.2)';
        navBadge.style.color = '#EF4444';
      } else if (scheduled > 0) {
        navBadge.textContent = `${scheduled}`;
        navBadge.className = 'badge blue';
        navBadge.style.background = '';
        navBadge.style.color = '';
      } else {
        navBadge.textContent = 'Meet';
        navBadge.className = 'badge blue';
        navBadge.style.background = '';
        navBadge.style.color = '';
      }
    }

    // Live stat chip glowing state
    const liveChip = document.getElementById('meet-stat-live-chip');
    if (liveChip) {
      if (live > 0) {
        liveChip.classList.add('live-active');
      } else {
        liveChip.classList.remove('live-active');
      }
    }
  },

  // ── Apply Filters & Search ───────────────────────────────────────────────
  applyFilters() {
    let list = [...this.meetings];

    // Status filter
    if (this.activeFilter !== 'all') {
      list = list.filter(m => m.status === this.activeFilter);
    }

    // Squad filter
    if (this.squadFilter === 'company') {
      list = list.filter(m => !m.team_id);
    } else if (this.squadFilter !== 'all') {
      const targetTeamId = parseInt(this.squadFilter);
      list = list.filter(m => m.team_id === targetTeamId);
    }

    // Search query
    if (this.searchQuery) {
      list = list.filter(m =>
        (m.title || '').toLowerCase().includes(this.searchQuery) ||
        (m.team_name || '').toLowerCase().includes(this.searchQuery) ||
        (m.host_name || '').toLowerCase().includes(this.searchQuery) ||
        (m.description || '').toLowerCase().includes(this.searchQuery)
      );
    }

    this.filtered = list;
    this.renderMeetingsList();
  },

  // ── Render Meeting Cards ─────────────────────────────────────────────────
  renderMeetingsList() {
    const container = document.getElementById('meetings-list-container');
    if (!container) return;

    if (this.filtered.length === 0) {
      const user = window.TaskflowAuth?.currentUser || {};
      const isPrivileged = user.role === 'Admin' || user.role === 'Lead' || user.is_admin;

      let emptyTitle = 'No Meetings Found';
      let emptyMsg = 'No squad or company-wide video conferences scheduled at this time.';

      if (this.searchQuery) {
        emptyMsg = `No meetings match "${this.escapeHtml(this.searchQuery)}". Try adjusting your search query.`;
      } else if (this.activeFilter === 'Live') {
        emptyTitle = 'No Live Meetings';
        emptyMsg = 'There are no active video rooms in session right now.';
      } else if (this.activeFilter === 'Scheduled') {
        emptyTitle = 'No Upcoming Sessions';
        emptyMsg = 'All clear! No upcoming conferences queued.';
      }

      container.innerHTML = `
        <div class="meetings-empty-state">
          <div class="meetings-empty-icon-wrap" style="width: 64px; height: 64px; border-radius: 50%; background: rgba(46, 125, 50, 0.1); color: var(--color-brand-primary, #2E7D32); display: flex; align-items: center; justify-content: center; margin-bottom: 12px;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
          </div>
          <h4>${emptyTitle}</h4>
          <p>${emptyMsg}</p>
          <div class="meetings-empty-actions" style="margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap; justify-content: center;">
            ${isPrivileged ? `
              <button type="button" class="btn primary" onclick="document.getElementById('btn-open-schedule-meeting')?.click()">
                + Schedule Meeting
              </button>
              <button type="button" class="btn meetings-huddle-btn" onclick="TaskflowMeetings.handleInstantHuddle()">
                ⚡ Instant Huddle
              </button>
            ` : `
              <button type="button" class="btn primary" onclick="TaskflowMeetings.loadMeetings()">
                🔄 Refresh Meetings
              </button>
              <button type="button" class="btn secondary" onclick="document.querySelector('[data-target=\'chat\']')?.click()">
                💬 Squad Chat
              </button>
            `}
          </div>
        </div>
      `;
      return;
    }

    const user = window.TaskflowAuth?.currentUser || {};
    const isAdmin = user.role === 'Admin' || user.is_admin;

    let html = '';
    this.filtered.forEach(m => {
      const isLive  = m.status === 'Live';
      const isHost  = m.host_id === user.id || isAdmin;
      const typeLabel = this.getMeetingTypeLabel(m.duration_minutes);
      const relativeTime = this.formatRelativeTime(m.scheduled_time, m.formatted_time, isLive);

      const statusPill = isLive
        ? `<span class="badge green pulse" style="background:rgba(220,38,38,0.12); color:#DC2626; font-weight:800; font-size:11.5px; display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:20px; border:1px solid rgba(220,38,38,0.3);">
            <span class="speaking-dot" style="background:#DC2626;"></span>
            LIVE NOW
          </span>`
        : `<span class="badge blue" style="background:rgba(59,130,246,0.1); color:#2563EB; font-weight:700; font-size:11.5px; padding:4px 10px; border-radius:20px; border:1px solid rgba(59,130,246,0.25);">
            ${this.escapeHtml(m.status)}
          </span>`;

      html += `
        <div class="meeting-card interactive-card" data-meeting-id="${m.id}">
          <div class="meeting-card-accent-bar ${isLive ? 'live-bar' : ''}"></div>
          <div class="meeting-card-body">
            <div class="meeting-card-head">
              <div style="flex:1; min-width:0; padding-right:8px;">
                <h4 class="meeting-card-title">${this.escapeHtml(m.title)}</h4>
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                  <span class="meeting-card-squad">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
                    </svg>
                    ${this.escapeHtml(m.team_name || 'All Company')}
                  </span>
                  <span style="font-size:11px; color:var(--color-text-secondary); font-weight:600;">${typeLabel}</span>
                </div>
              </div>
              <div>${statusPill}</div>
            </div>

            <p class="meeting-card-desc">${this.escapeHtml(m.description || 'Sprint alignment, technical deliverables sync, and architecture review.')}</p>

            <div class="meeting-meta-row">
              <div class="meeting-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                <span><b>${relativeTime}</b> &bull; ${m.duration_minutes} mins</span>
              </div>

              <div class="meeting-meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                <span>Host: <b>${this.escapeHtml(m.host_name)}</b>${isHost ? ' <span style="color:var(--color-brand-primary, #2E7D32); font-weight:700;">(You)</span>' : ''}</span>
              </div>

              ${m.room_id ? `
                <div class="meeting-meta-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
                  </svg>
                  <span style="font-family:monospace; font-size:11px;">Room: ${this.escapeHtml(m.room_id)}</span>
                </div>
              ` : ''}
            </div>

            <div class="meeting-actions-row">
              <button type="button" class="btn primary btn-sm btn-join-meet ${isLive ? 'live-btn' : ''}" onclick="TaskflowMeetings.joinMeeting(${m.id})">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
                <span>${isLive ? '● Join Live Room' : 'Join Meeting'}</span>
              </button>

              <button type="button" class="btn-copy-card-link" onclick="TaskflowMeetings.copyMeetingLink(${m.id}, event)" title="Copy Meeting Link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>

              ${isHost ? `
                <button type="button" class="btn-delete-meet" onclick="TaskflowMeetings.deleteMeeting(${m.id})" title="Cancel &amp; Delete Session">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  // ── Meeting Type Helper ──────────────────────────────────────────────────
  getMeetingTypeLabel(mins) {
    if (mins <= 15) return '⚡ Standup';
    if (mins <= 30) return '🔄 Sprint Sync';
    if (mins <= 45) return '🎨 Design Review';
    if (mins <= 60) return '🏛️ Strategic Alignment';
    return '📋 Extended Session';
  },

  // ── Relative Time Helper ─────────────────────────────────────────────────
  formatRelativeTime(isoStr, formattedStr, isLive) {
    if (isLive) return 'In Session Now';
    if (!isoStr) return formattedStr || 'Upcoming';

    try {
      const d = new Date(isoStr);
      const now = new Date();
      const diffMs = d - now;
      const diffMins = Math.round(diffMs / (60 * 1000));

      if (diffMins > 0 && diffMins <= 60) {
        return `Starts in ${diffMins} min${diffMins > 1 ? 's' : ''}`;
      } else if (diffMins > 60 && diffMins <= 180) {
        const hrs = Math.floor(diffMins / 60);
        return `Starts in ~${hrs} hr${hrs > 1 ? 's' : ''}`;
      }

      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `Today at ${timeStr}`;
      }

      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (d.toDateString() === tomorrow.toDateString()) {
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `Tomorrow at ${timeStr}`;
      }

      return formattedStr || d.toLocaleDateString();
    } catch {
      return formattedStr || 'Upcoming';
    }
  },

  // ── Quick Instant Huddle ─────────────────────────────────────────────────
  async handleInstantHuddle() {
    const user = window.TaskflowAuth?.currentUser || {};
    const squadName = user.team_name || 'Engineering Squad';
    const title = `⚡ Instant Huddle — ${squadName}`;

    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: 'Spontaneous squad huddle launched via quick action.',
          team_id: user.team_id || null,
          scheduled_time: new Date().toISOString(),
          duration_minutes: 15
        })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to start instant huddle.');
        return;
      }

      await this.loadMeetings();
      // Automatically join the newly created room
      if (data.meeting?.id) {
        await this.joinMeeting(data.meeting.id);
      }
    } catch (err) {
      console.error('[Meetings] Instant Huddle Error:', err);
      alert('Error launching instant huddle.');
    }
  },

  // ── Schedule Form Submit ─────────────────────────────────────────────────
  async handleCreateMeeting(form, modal) {
    const title = form.title?.value?.trim();
    if (!title) return;

    const description      = form.description?.value?.trim() || '';
    const team_id          = form.team_id?.value || null;
    const scheduled_time   = form.scheduled_time?.value || null;
    const duration_minutes = parseInt(form.duration_minutes?.value || 30);

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Scheduling...'; }

    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, team_id, scheduled_time, duration_minutes })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to schedule meeting.');
        return;
      }

      form.reset();
      modal.close();
      await this.loadMeetings();
    } catch (err) {
      console.error('[Meetings] Create error:', err);
      alert('Error scheduling meeting.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
          </svg> Launch Meeting Session
        `;
      }
    }
  },

  // ── Copy Link from Card ──────────────────────────────────────────────────
  copyMeetingLink(meetingId, event) {
    const meeting = this.meetings.find(m => m.id === meetingId);
    if (!meeting) return;

    const link = meeting.meeting_link || window.location.href;
    const btn = event?.currentTarget;

    navigator.clipboard.writeText(link).then(() => {
      if (btn) {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<span style="color:#16A34A; font-size:13px; font-weight:800;">✓</span>`;
        btn.title = 'Link copied!';
        setTimeout(() => {
          btn.innerHTML = originalHtml;
          btn.title = 'Copy Meeting Link';
        }, 1800);
      }
    }).catch(() => {
      alert(`Meeting Link:\n${link}`);
    });
  },

  // ── Join Meeting ─────────────────────────────────────────────────────────
  async joinMeeting(meetingId) {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/join`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Cannot join meeting.');
        return;
      }
      this.activeMeeting = data.meeting;
      this.openMeetingRoom(data.meeting, data.room_url);
    } catch (err) {
      console.error('[Meetings] Join failed:', err);
      alert('Error joining meeting.');
    }
  },

  // ── Open Active Video Room Modal ─────────────────────────────────────────
  openMeetingRoom(meeting, roomUrl) {
    const modal = document.getElementById('modal-active-meeting-room');
    if (!modal) return;

    const titleEl = document.getElementById('active-room-title');
    const squadEl = document.getElementById('active-room-squad');
    const extLink = document.getElementById('active-room-ext-link');

    if (titleEl) titleEl.textContent = meeting.title;
    if (squadEl) squadEl.textContent = `${meeting.team_name || 'All Company'} • Room: ${meeting.room_id}`;
    if (extLink) extLink.href = roomUrl || meeting.meeting_link;

    // Set self initials
    const user = window.TaskflowAuth?.currentUser || {};
    const selfAvatar = document.getElementById('meeting-self-avatar');
    const selfName   = document.getElementById('meeting-self-name');
    if (selfAvatar) {
      selfAvatar.textContent = (user.username || 'YOU').slice(0, 2).toUpperCase();
    }
    if (selfName) {
      selfName.textContent = user.username || 'Your Stream';
    }

    // Reset meeting room states
    this.isMicMuted = false;
    this.isVideoOff = false;
    this.isScreenSharing = false;
    this.isHandRaised = false;

    // Reset visual elements
    const wave = document.getElementById('meeting-audio-wave');
    if (wave) wave.classList.remove('muted');
    const screenOverlay = document.getElementById('meeting-screen-preview');
    if (screenOverlay) screenOverlay.style.display = 'none';
    const handBadge = document.getElementById('meeting-hand-badge');
    if (handBadge) handBadge.style.display = 'none';

    // Reset buttons
    const btnMic = document.getElementById('btn-meeting-toggle-mic');
    if (btnMic) {
      btnMic.className = 'meet-ctrl-btn';
      btnMic.title = 'Mute Microphone (M)';
      btnMic.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
    }

    const btnCam = document.getElementById('btn-meeting-toggle-cam');
    if (btnCam) {
      btnCam.className = 'meet-ctrl-btn';
      btnCam.title = 'Turn Camera Off (V)';
      btnCam.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
    }

    const vidPreview = document.getElementById('meeting-self-preview');
    if (vidPreview) {
      vidPreview.style.background = 'linear-gradient(135deg, #0F1E36 0%, #064E3B 100%)';
    }

    this.callSeconds = 0;
    this.startCallTimer();
    modal.showModal();
  },

  // ── Call Timer ───────────────────────────────────────────────────────────
  startCallTimer() {
    const timerEl = document.getElementById('active-room-timer');
    if (this.callTimer) clearInterval(this.callTimer);

    const updateTimer = () => {
      this.callSeconds++;
      const mins = String(Math.floor(this.callSeconds / 60)).padStart(2, '0');
      const secs = String(this.callSeconds % 60).padStart(2, '0');
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    };

    updateTimer();
    this.callTimer = setInterval(updateTimer, 1000);
  },

  // ── Leave Meeting Room ───────────────────────────────────────────────────
  leaveMeetingRoom() {
    if (this.callTimer) {
      clearInterval(this.callTimer);
      this.callTimer = null;
    }
    const modal = document.getElementById('modal-active-meeting-room');
    if (modal) modal.close();

    // Close in-room drawer if open
    const drawer = document.getElementById('meeting-inroom-drawer');
    if (drawer) drawer.style.display = 'none';

    this.activeMeeting = null;
    this.loadMeetings();
  },

  // ── Toggle Microphone ────────────────────────────────────────────────────
  toggleMicrophone() {
    this.isMicMuted = !this.isMicMuted;
    const btn = document.getElementById('btn-meeting-toggle-mic');
    const wave = document.getElementById('meeting-audio-wave');
    const micStatus = document.getElementById('tile-mic-status');

    if (btn) {
      btn.className = this.isMicMuted ? 'meet-ctrl-btn btn-muted' : 'meet-ctrl-btn';
      btn.title = this.isMicMuted ? 'Unmute Microphone (M)' : 'Mute Microphone (M)';
      btn.innerHTML = this.isMicMuted
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
    }

    if (wave) {
      if (this.isMicMuted) wave.classList.add('muted');
      else wave.classList.remove('muted');
    }

    if (micStatus) {
      micStatus.textContent = this.isMicMuted ? '🔇' : '🎤';
    }
  },

  // ── Toggle Camera ────────────────────────────────────────────────────────
  toggleCamera() {
    this.isVideoOff = !this.isVideoOff;
    const btn = document.getElementById('btn-meeting-toggle-cam');
    const vidPreview = document.getElementById('meeting-self-preview');

    if (btn) {
      btn.className = this.isVideoOff ? 'meet-ctrl-btn btn-muted' : 'meet-ctrl-btn';
      btn.title = this.isVideoOff ? 'Turn Camera On (V)' : 'Turn Camera Off (V)';
      btn.innerHTML = this.isVideoOff
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;
    }

    if (vidPreview) {
      vidPreview.style.background = this.isVideoOff
        ? '#0B0F19'
        : 'linear-gradient(135deg, #0F1E36 0%, #064E3B 100%)';
    }
  },

  // ── Toggle Screen Share ──────────────────────────────────────────────────
  toggleScreenShare() {
    this.isScreenSharing = !this.isScreenSharing;
    const overlay = document.getElementById('meeting-screen-preview');
    const btn = document.getElementById('btn-meeting-toggle-screen');

    if (overlay) {
      overlay.style.display = this.isScreenSharing ? 'flex' : 'none';
    }

    if (btn) {
      if (this.isScreenSharing) {
        btn.classList.add('btn-active');
        btn.title = 'Stop Sharing Screen';
      } else {
        btn.classList.remove('btn-active');
        btn.title = 'Share Screen';
      }
    }
  },

  // ── Toggle Raise Hand ────────────────────────────────────────────────────
  toggleRaiseHand() {
    this.isHandRaised = !this.isHandRaised;
    const badge = document.getElementById('meeting-hand-badge');
    const btn = document.getElementById('btn-meeting-toggle-hand');

    if (badge) {
      badge.style.display = this.isHandRaised ? 'block' : 'none';
    }

    if (btn) {
      if (this.isHandRaised) {
        btn.classList.add('btn-active');
        btn.title = 'Lower Hand (H)';
      } else {
        btn.classList.remove('btn-active');
        btn.title = 'Raise Hand (H)';
      }
    }
  },

  // ── In-Room Drawer Toggle & Tabs ─────────────────────────────────────────
  toggleInroomDrawer() {
    const drawer = document.getElementById('meeting-inroom-drawer');
    const btn = document.getElementById('btn-meeting-toggle-chat');
    if (!drawer) return;

    const isVisible = drawer.style.display !== 'none';
    drawer.style.display = isVisible ? 'none' : 'flex';

    if (btn) {
      if (!isVisible) btn.classList.add('btn-active');
      else btn.classList.remove('btn-active');
    }
  },

  switchDrawerTab(tab) {
    this.activeDrawerTab = tab;
    const tabChat = document.getElementById('btn-tab-inroom-chat');
    const tabMembers = document.getElementById('btn-tab-inroom-members');
    const bodyChat = document.getElementById('inroom-chat-body');
    const bodyMembers = document.getElementById('inroom-members-body');

    if (tab === 'chat') {
      tabChat?.classList.add('active');
      tabMembers?.classList.remove('active');
      if (bodyChat) bodyChat.style.display = 'flex';
      if (bodyMembers) bodyMembers.style.display = 'none';
    } else {
      tabMembers?.classList.add('active');
      tabChat?.classList.remove('active');
      if (bodyMembers) bodyMembers.style.display = 'flex';
      if (bodyChat) bodyChat.style.display = 'none';
    }
  },

  sendInroomMessage() {
    const input = document.getElementById('inroom-chat-input');
    const list  = document.getElementById('inroom-messages-list');
    if (!input || !list) return;

    const text = input.value.trim();
    if (!text) return;

    const user = window.TaskflowAuth?.currentUser || {};
    const name = user.username || 'You';

    const msgEl = document.createElement('div');
    msgEl.className = 'inroom-msg';
    msgEl.innerHTML = `
      <span class="msg-sender" style="color:#4ADE80;">${this.escapeHtml(name)} (You):</span>
      <span class="msg-text">${this.escapeHtml(text)}</span>
    `;

    list.appendChild(msgEl);
    list.scrollTop = list.scrollHeight;
    input.value = '';
  },

  sendReaction(emoji) {
    const list = document.getElementById('inroom-messages-list');
    if (!list) return;

    const user = window.TaskflowAuth?.currentUser || {};
    const name = user.username || 'You';

    const msgEl = document.createElement('div');
    msgEl.className = 'inroom-msg';
    msgEl.style.display = 'inline-flex';
    msgEl.style.alignItems = 'center';
    msgEl.style.gap = '8px';
    msgEl.innerHTML = `
      <span style="font-size: 20px;">${emoji}</span>
      <span style="font-size: 11.5px; color:#94A3B8;">${this.escapeHtml(name)} reacted</span>
    `;

    list.appendChild(msgEl);
    list.scrollTop = list.scrollHeight;
  },

  // ── Delete Meeting ───────────────────────────────────────────────────────
  async deleteMeeting(meetingId) {
    if (!confirm('Are you sure you want to cancel and remove this scheduled meeting?')) return;

    try {
      const res = await fetch(`/api/meetings/${meetingId}`, { method: 'DELETE' });
      if (res.ok) {
        await this.loadMeetings();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to cancel meeting.');
      }
    } catch (err) {
      console.error('[Meetings] Delete error:', err);
    }
  },

  // ── HTML Escape ──────────────────────────────────────────────────────────
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

window.TaskflowMeetings = TaskflowMeetings;
