/**
 * Taskflow Attendance Tracking & Leave Management Module
 * Live digital clock, check in/out actions, daily metrics, team leave approval queue,
 * leave application modal, and teammate visual presence indicators.
 */

const TaskflowAttendance = {
  clockTimer: null,
  shiftTimer: null,
  todayData: null,
  presenceMap: {},

  async init() {
    this.startDigitalClock();
    this.bindDOM();
    await this.fetchTodayStatus();
    await this.fetchLeaves();
    await this.fetchPresenceMap();
  },

  startDigitalClock() {
    const clockEl = document.getElementById('att-live-clock');
    const dateEl = document.getElementById('att-live-date');

    const updateClock = () => {
      const now = new Date();
      if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
      if (dateEl) {
        dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      }
    };

    updateClock();
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = setInterval(updateClock, 1000);
  },

  bindDOM() {
    // Check-in / check-out button
    const btnAction = document.getElementById('btn-checkin-action');
    if (btnAction) {
      btnAction.addEventListener('click', () => this.toggleCheckIn());
    }

    // Apply Leave Button & Modal
    const btnOpenLeave = document.getElementById('btn-open-apply-leave');
    const modalLeave = document.getElementById('modal-apply-leave');
    const formLeave = document.getElementById('form-apply-leave');
    const btnCloseLeave = document.getElementById('btn-close-leave-modal');

    if (btnOpenLeave && modalLeave) {
      btnOpenLeave.addEventListener('click', () => {
        // Default start date to today, end date to tomorrow
        const todayStr = new Date().toISOString().substring(0, 10);
        const startInput = document.getElementById('leave-start-date');
        const endInput = document.getElementById('leave-end-date');
        if (startInput) startInput.value = todayStr;
        if (endInput) endInput.value = todayStr;
        modalLeave.showModal();
      });
    }

    if (btnCloseLeave && modalLeave) {
      btnCloseLeave.addEventListener('click', () => modalLeave.close());
    }

    if (formLeave && modalLeave) {
      formLeave.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.submitLeaveRequest(formLeave, modalLeave);
      });
    }
  },

  async fetchTodayStatus() {
    try {
      const res = await fetch('/api/attendance/today');
      if (!res.ok) return;
      const data = await res.json();
      this.todayData = data;
      this.renderCheckInWidget(data);
      this.renderMetrics(data.metrics);
      this.renderTeammates(data.teammates);
    } catch (err) {
      console.error('[Attendance] Error fetching today status:', err);
    }
  },

  renderCheckInWidget(data) {
    const btnAction = document.getElementById('btn-checkin-action');
    const statusText = document.getElementById('att-checkin-status-text');
    const sessionDetails = document.getElementById('att-session-details');
    const badgeSidebar = document.getElementById('badge-attendance');

    const isCheckedIn = data.is_checked_in;
    const record = data.current_record;

    if (this.shiftTimer) {
      clearInterval(this.shiftTimer);
      this.shiftTimer = null;
    }

    if (btnAction) {
      if (isCheckedIn) {
        btnAction.className = 'checkin-action-btn btn-out';
        btnAction.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          <span>Check Out</span>
        `;
      } else {
        btnAction.className = 'checkin-action-btn btn-in';
        btnAction.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          <span>Check In</span>
        `;
      }
    }

    if (isCheckedIn && record) {
      const checkInTimeStr = record.check_in_time || '';
      let startMs = Date.now();
      if (checkInTimeStr) {
        const parsed = new Date(checkInTimeStr.endsWith('Z') ? checkInTimeStr : checkInTimeStr + 'Z');
        if (!isNaN(parsed.getTime())) {
          startMs = parsed.getTime();
        } else {
          startMs = Date.now() - ((record.total_hours || 0) * 3600 * 1000);
        }
      }

      const updateShiftClock = () => {
        const elapsedSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
        const hrs = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
        const mins = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
        const secs = String(elapsedSec % 60).padStart(2, '0');
        const formattedDuration = `${hrs}h ${mins}m ${secs}s`;

        if (statusText) {
          statusText.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22C55E;margin-right:6px;box-shadow:0 0 8px #22C55E;"></span>Active Shift • In at ${record.formatted_check_in || 'Today'} (${formattedDuration})`;
          statusText.style.color = '#4ADE80';
        }

        if (sessionDetails) {
          sessionDetails.innerHTML = `
            <span>Status: <b style="color: var(--color-brand-primary);">Active Working</b></span>
            <span>Live Duration: <b>${formattedDuration}</b></span>
          `;
        }

        const mToday = document.getElementById('att-metric-today');
        if (mToday) {
          mToday.textContent = `${(elapsedSec / 3600).toFixed(2)} hrs (Live)`;
        }
      };

      updateShiftClock();
      this.shiftTimer = setInterval(updateShiftClock, 1000);
    } else {
      if (statusText) {
        if (record && record.check_out_time) {
          statusText.textContent = `Completed Work Session • Checked out at ${record.formatted_check_out} (${record.total_hours} hrs)`;
          statusText.style.color = '#94A3B8';
        } else {
          statusText.textContent = 'Not Checked In Today';
          statusText.style.color = '#94A3B8';
        }
      }

      if (sessionDetails && record) {
        sessionDetails.innerHTML = `
          <span>Status: <b>${record.status}</b></span>
          <span>Today Logged: <b>${record.total_hours} hrs</b></span>
        `;
      }
    }

    // Update sidebar indicator
    if (badgeSidebar) {
      if (isCheckedIn) {
        badgeSidebar.textContent = 'In';
        badgeSidebar.className = 'badge green';
        badgeSidebar.style.display = 'inline-flex';
      } else {
        badgeSidebar.textContent = 'Off';
        badgeSidebar.className = 'badge gray';
        badgeSidebar.style.display = 'inline-flex';
      }
    }
  },

  renderMetrics(metrics) {
    if (!metrics) return;

    const mToday = document.getElementById('att-metric-today');
    const mMonthly = document.getElementById('att-metric-monthly');
    const mDays = document.getElementById('att-metric-days');
    const mBalance = document.getElementById('att-metric-balance');

    if (mToday) mToday.textContent = `${metrics.today_hours || 0} hrs`;
    if (mMonthly) mMonthly.textContent = `${metrics.monthly_hours || 0} hrs`;
    if (mDays) mDays.textContent = `${metrics.working_days || 0} days`;
    if (mBalance) mBalance.textContent = `${metrics.leave_balance || 0} days`;
  },

  renderTeammates(teammates) {
    const listEl = document.getElementById('teammates-presence-container');
    if (!listEl) return;

    if (!teammates || teammates.length === 0) {
      listEl.innerHTML = `<p class="empty" style="grid-column: 1 / -1; margin: 8px 0; color: var(--color-text-muted); font-size: 13px;">No other members in this squad roster.</p>`;
      return;
    }

    let html = '';
    teammates.forEach(m => {
      let statusBadge = `<span style="font-size: 11px; color: var(--color-text-muted);">Offline</span>`;
      let dotClass = '';

      if (m.on_leave) {
        statusBadge = `<span style="font-size: 11px; color: var(--color-warning-fg); font-weight: 600;">🏖️ On ${m.leave_type || 'Leave'}</span>`;
        dotClass = 'on-leave';
      } else if (m.is_checked_in) {
        statusBadge = `<span style="font-size: 11px; color: var(--color-brand-primary); font-weight: 600;">● Online (${m.total_hours}h)</span>`;
        dotClass = 'online';
      }

      html += `
        <div class="teammate-presence-card">
          <div class="avatar-presence-wrap">
            <div class="avatar avatar-sm">${this.escapeHtml(m.initials)}</div>
            ${dotClass ? `<span class="presence-dot ${dotClass}"></span>` : ''}
          </div>
          <div class="teammate-presence-info">
            <h5>${this.escapeHtml(m.name)}</h5>
            <p>${statusBadge} • <span class="role-badge role-${m.role}" style="font-size: 10px; padding: 1px 6px;">${m.role}</span></p>
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;
  },

  async toggleCheckIn() {
    const isCheckedIn = this.todayData?.is_checked_in;
    const url = isCheckedIn ? '/api/attendance/check-out' : '/api/attendance/check-in';

    try {
      const res = await fetch(url, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Attendance action failed.');
        return;
      }
      await this.fetchTodayStatus();
      await this.fetchPresenceMap();
    } catch (err) {
      console.error('[Attendance] Toggle check-in failed:', err);
    }
  },

  async fetchLeaves() {
    try {
      const res = await fetch('/api/leaves');
      if (!res.ok) return;
      const data = await res.json();
      const leaves = data.leaves || [];
      this.renderLeaveQueue(leaves);
      this.renderLeaveHistory(leaves);
    } catch (err) {
      console.error('[Attendance] Fetch leaves failed:', err);
    }
  },

  renderLeaveQueue(leaves) {
    const cardEl = document.getElementById('leave-approval-card');
    const tbody = document.getElementById('leave-approval-table-body');
    if (!cardEl || !tbody) return;

    const currentUser = window.TaskflowAuth?.currentUser || {};
    const isLeadOrAdmin = currentUser.role === 'Admin' || currentUser.role === 'Lead' || currentUser.is_admin;

    // Show approval queue only for Leads/Admins
    cardEl.style.display = isLeadOrAdmin ? 'block' : 'none';
    if (!isLeadOrAdmin) return;

    const pendingLeaves = leaves.filter(l => l.status === 'Pending' && l.user_id !== currentUser.id);

    if (pendingLeaves.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty" style="text-align: center; padding: 24px; color: var(--color-text-muted);">
            No pending leave requests requiring approval.
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    pendingLeaves.forEach(l => {
      html += `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="avatar avatar-sm">${this.escapeHtml(l.user_initials || 'U')}</div>
              <div>
                <strong style="display: block; font-size: 13px;">${this.escapeHtml(l.user_name)}</strong>
                <span class="text-sm text-muted" style="font-size: 11px;">${this.escapeHtml(l.user_email)}</span>
              </div>
            </div>
          </td>
          <td><span class="pill">${this.escapeHtml(l.leave_type)}</span></td>
          <td><b>${this.escapeHtml(l.start_date)}</b> to <b>${this.escapeHtml(l.end_date)}</b></td>
          <td style="max-width: 200px; font-size: 12px; color: var(--color-text-secondary);">${this.escapeHtml(l.reason)}</td>
          <td><span class="leave-badge Pending">Pending</span></td>
          <td style="text-align: right;">
            <div style="display: inline-flex; gap: 6px;">
              <button class="btn btn-sm primary" onclick="TaskflowAttendance.actionLeave(${l.id}, 'approve')" title="Approve Request">
                Approve
              </button>
              <button class="btn btn-sm danger" onclick="TaskflowAttendance.actionLeave(${l.id}, 'reject')" title="Reject Request">
                Reject
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  renderLeaveHistory(leaves) {
    const tbody = document.getElementById('my-leaves-table-body');
    if (!tbody) return;

    const currentUserId = window.TaskflowAuth?.currentUser?.id;
    const myLeaves = leaves.filter(l => l.user_id === currentUserId);

    if (myLeaves.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="empty" style="text-align: center; padding: 24px; color: var(--color-text-muted);">
            You have not submitted any leave requests.
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    myLeaves.forEach(l => {
      const statusClass = l.status || 'Pending';
      html += `
        <tr>
          <td><b>${this.escapeHtml(l.leave_type)}</b></td>
          <td>${this.escapeHtml(l.start_date)} to ${this.escapeHtml(l.end_date)}</td>
          <td style="max-width: 240px; font-size: 12px; color: var(--color-text-secondary);">${this.escapeHtml(l.reason)}</td>
          <td>
            <span class="leave-badge ${statusClass}">${statusClass}</span>
            ${l.review_comment ? `<p style="margin: 4px 0 0; font-size: 11px; color: var(--color-text-muted);">Note: ${this.escapeHtml(l.review_comment)}</p>` : ''}
          </td>
          <td style="font-size: 12px; color: var(--color-text-muted);">${this.escapeHtml(l.formatted_created_at || '')}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  async actionLeave(leaveId, action) {
    const comment = prompt(`Enter review feedback or notes for ${action}ing this leave:`) || '';
    try {
      const res = await fetch(`/api/leaves/${leaveId}/action`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, comment })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to action leave request.');
        return;
      }
      await this.fetchLeaves();
      await this.fetchTodayStatus();
      await this.fetchPresenceMap();
    } catch (err) {
      console.error('[Attendance] Action leave failed:', err);
    }
  },

  async submitLeaveRequest(form, modal) {
    const formData = new FormData(form);
    const payload = {
      leave_type: formData.get('leave_type'),
      start_date: formData.get('start_date'),
      end_date: formData.get('end_date'),
      reason: formData.get('reason')
    };

    try {
      const res = await fetch('/api/leaves/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to submit leave request.');
        return;
      }
      modal.close();
      form.reset();
      await this.fetchLeaves();
      await this.fetchTodayStatus();
    } catch (err) {
      console.error('[Attendance] Apply leave failed:', err);
    }
  },

  async fetchPresenceMap() {
    try {
      const res = await fetch('/api/attendance/presence');
      if (!res.ok) return;
      const data = await res.json();
      this.presenceMap = data.presence || {};
      this.applyPresenceBadges();
    } catch (err) {
      console.error('[Attendance] Fetch presence failed:', err);
    }
  },

  applyPresenceBadges() {
    // Look for all assignee wrappers in the task tables and update avatar indicators
    document.querySelectorAll('.task-table .assignee-wrap, table .assignee-wrap, .assignee-wrap').forEach(wrap => {
      const tr = wrap.closest('tr[data-task-id]');
      if (!tr) return;
      const taskId = parseInt(tr.getAttribute('data-task-id'));
      const task = window.TaskflowTasks?.allTasks?.find(t => t.id === taskId);
      if (!task || !task.assigned_to_id) return;

      const pInfo = this.presenceMap[task.assigned_to_id];
      if (!pInfo) return;

      const avatar = wrap.querySelector('.avatar');
      if (!avatar) return;

      // Remove existing presence badge if any
      const existingDot = wrap.querySelector('.task-presence-indicator');
      if (existingDot) existingDot.remove();

      const indicator = document.createElement('span');
      indicator.className = 'task-presence-indicator';
      indicator.style.cssText = 'position: absolute; bottom: -2px; right: -2px; width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--color-surface);';

      if (pInfo.on_leave) {
        indicator.style.background = '#F59E0B';
        indicator.title = `Currently on ${pInfo.leave_type || 'Leave'}`;
        wrap.style.position = 'relative';
        wrap.appendChild(indicator);
      } else if (pInfo.is_checked_in) {
        indicator.style.background = '#22C55E';
        indicator.title = 'Checked in today (Online)';
        wrap.style.position = 'relative';
        wrap.appendChild(indicator);
      }
    });
  },

  async fetchWorkforceSummary() {
    const tableBody = document.getElementById('admin-workforce-attendance-body');
    if (!tableBody) return;

    try {
      const res = await fetch('/api/attendance/workforce-summary');
      if (!res.ok) return;
      const data = await res.json();
      const workforce = data.workforce || [];

      if (workforce.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="7" class="empty" style="text-align: center; padding: 24px;">No workforce records available for today.</td></tr>`;
        return;
      }

      let html = '';
      workforce.forEach(w => {
        let statusBadge = `<span class="badge gray">Not Checked In</span>`;
        if (w.is_checked_in) {
          statusBadge = `<span class="badge green" style="background: rgba(46,125,50,0.15); color: #2E7D32; font-weight: 700;">● Active Working</span>`;
        } else if (w.is_checked_out) {
          statusBadge = `<span class="badge blue" style="background: rgba(2,132,199,0.15); color: #0284C7;">Completed Shift</span>`;
        }

        const hrs = Math.floor(w.active_seconds / 3600);
        const mins = Math.floor((w.active_seconds % 3600) / 60);
        const activeDurationStr = w.is_checked_in ? `${hrs}h ${mins}m active` : '—';

        html += `
          <tr class="interactive-row">
            <td>
              <div style="display: flex; align-items: center; gap: 10px;">
                <div class="avatar avatar-sm" style="font-weight: 700; background: var(--color-brand-soft); color: var(--color-brand-primary);">
                  ${(w.username || 'U').substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong style="display: block; font-size: 13.5px; color: var(--color-text-primary);">${this.escapeHtml(w.username)}</strong>
                  <span class="text-sm text-muted" style="font-size: 11px;">${this.escapeHtml(w.email)}</span>
                </div>
              </div>
            </td>
            <td><span class="role-badge role-${w.role}">${w.role}</span></td>
            <td><span class="pill">${this.escapeHtml(w.team_name)}</span></td>
            <td>${statusBadge}</td>
            <td style="font-family: monospace; font-size: 12.5px;">
              <span>IN: <b>${w.check_in_time}</b></span><br>
              <span style="color: var(--color-text-muted);">OUT: <b>${w.check_out_time}</b></span>
            </td>
            <td>
              <b style="color: var(--color-brand-primary); font-size: 13px;">${w.today_hours} hrs</b>
              ${w.is_checked_in ? `<br><small style="color: var(--color-text-muted); font-size: 10.5px;">${activeDurationStr}</small>` : ''}
            </td>
            <td>
              <strong style="font-size: 13px;">${w.monthly_hours} hrs</strong>
              <br><small style="color: var(--color-text-muted); font-size: 10.5px;">${w.working_days} days worked</small>
            </td>
          </tr>
        `;
      });

      tableBody.innerHTML = html;
    } catch (err) {
      console.error('[Attendance] Workforce summary failed:', err);
    }
  },

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

window.TaskflowAttendance = TaskflowAttendance;
