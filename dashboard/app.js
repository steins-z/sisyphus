// Sisyphus Dashboard — app.js
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  let currentView = 'system';
  let refreshTimer = null;

  // Navigation
  $$('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      switchView(item.dataset.view);
    });
  });

  function switchView(view) {
    currentView = view;
    $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
    // Reset session detail
    if (view === 'sessions') {
      $('#sessions-list').classList.remove('hidden');
      $('#session-detail').classList.add('hidden');
    }
    refresh();
  }

  // API helper
  async function api(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(res.statusText);
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  // Format uptime
  function formatUptime(seconds) {
    if (seconds == null) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Refresh current view
  async function refresh() {
    const dot = $('.status-dot');
    try {
      if (currentView === 'system') await refreshSystem();
      else if (currentView === 'sessions') await refreshSessions();
      else if (currentView === 'tasks') await refreshTasks();
      else if (currentView === 'workers') await refreshWorkers();
      dot.className = 'status-dot green';
    } catch {
      dot.className = 'status-dot red';
    }
  }

  async function refreshSystem() {
    const data = await api('/api/system');
    if (data) {
      $('#sys-status').innerHTML = `<span class="badge badge-running">${data.status}</span>`;
      $('#sys-uptime').textContent = formatUptime(data.uptime);
      $('#sys-pid').textContent = data.pid;
    } else {
      $('#sys-status').innerHTML = '<span class="badge badge-failed">unreachable</span>';
      $('#sys-uptime').textContent = '—';
      $('#sys-pid').textContent = '—';
    }
  }

  async function refreshSessions() {
    // Don't refresh list if viewing detail
    if (!$('#session-detail').classList.contains('hidden')) return;

    const sessions = await api('/api/sessions');
    const container = $('#sessions-list');
    if (!sessions || sessions.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No sessions yet</p></div>';
      return;
    }
    container.innerHTML = sessions.map((s) => `
      <div class="list-item" data-id="${s.id}">
        <div class="list-item-title">Session ${s.id.slice(0, 8)}…</div>
        <div class="list-item-meta">${s.messageCount} messages · ${formatTime(s.createdAt)}</div>
      </div>
    `).join('');

    container.querySelectorAll('.list-item').forEach((el) => {
      el.addEventListener('click', () => showSession(el.dataset.id));
    });
  }

  async function showSession(id) {
    $('#sessions-list').classList.add('hidden');
    $('#session-detail').classList.remove('hidden');
    $('#session-title').textContent = `Session ${id.slice(0, 8)}…`;

    const data = await api(`/api/sessions/${id}`);
    const container = $('#session-messages');
    if (!data || !data.messages || data.messages.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No messages</p></div>';
      return;
    }
    container.innerHTML = data.messages
      .filter((m) => m.role !== 'system')
      .map((m) => `
        <div class="message">
          <div class="message-role ${m.role}">${m.role}</div>
          <div class="message-content">${escapeHtml(m.content)}</div>
          <div class="message-time">${formatTime(m.timestamp)}</div>
        </div>
      `).join('');
  }

  $('#back-to-sessions').addEventListener('click', () => {
    $('#sessions-list').classList.remove('hidden');
    $('#session-detail').classList.add('hidden');
    refreshSessions();
  });

  async function refreshTasks() {
    const container = $('#tasks-content');
    const tasks = await api('/api/tasks');
    if (!tasks) {
      container.innerHTML = '<div class="empty-state"><p>Tasks API not available yet</p><p style="font-size:12px;margin-top:4px;color:var(--text-muted)">Will be enabled once the tasks module is merged</p></div>';
      return;
    }
    if (tasks.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No tasks</p></div>';
      return;
    }
    container.innerHTML = '<div class="list">' + tasks.map((t) => {
      const badge = t.status === 'done' ? 'badge-done' : t.status === 'failed' ? 'badge-failed' : t.status === 'running' ? 'badge-active' : 'badge-pending';
      return `<div class="list-item">
        <div class="list-item-title">${escapeHtml(t.description)} <span class="badge ${badge}">${t.status}</span></div>
        <div class="list-item-meta">${t.assignedTo ? 'Assigned to: ' + escapeHtml(t.assignedTo) : 'Unassigned'} · ${formatTime(t.createdAt)}</div>
      </div>`;
    }).join('') + '</div>';
  }

  async function refreshWorkers() {
    const container = $('#workers-content');
    const workers = await api('/api/workers');
    if (!workers) {
      container.innerHTML = '<div class="empty-state"><p>Workers API not available yet</p><p style="font-size:12px;margin-top:4px;color:var(--text-muted)">Will be enabled once the workers module is merged</p></div>';
      return;
    }
    if (workers.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No workers registered</p></div>';
      return;
    }
    container.innerHTML = '<div class="list">' + workers.map((w) => `
      <div class="list-item">
        <div class="list-item-title">${escapeHtml(w.name)}</div>
        <div class="list-item-meta">${escapeHtml(w.description || '')}</div>
      </div>
    `).join('') + '</div>';
  }

  // SSE for real-time events
  function connectSSE() {
    try {
      const es = new EventSource('/api/dashboard/events');
      es.addEventListener('heartbeat', () => { /* keep alive */ });
      es.addEventListener('refresh', () => refresh());
      es.onerror = () => {
        es.close();
        setTimeout(connectSSE, 5000);
      };
    } catch { /* ignore */ }
  }

  // Init
  refresh();
  refreshTimer = setInterval(refresh, 5000);
  connectSSE();
})();
