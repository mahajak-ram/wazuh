  /* ═══════════════════════════════════════════════
    overview.js — Wazuh Dashboard (เชื่อม 3 CARDS)
    ✅ ดึงข้อมูล API จริง + อัปเดต Charts
  ═══════════════════════════════════════════════ */

  const PROXY = 'http://localhost:3001';
  const REFRESH_INTERVAL = 30000; 

  // ═══════════════════════════════════════════════
  // 🔐 LOGIN CHECK & 5-MINUTES AUTOLOGOUT
  // ═══════════════════════════════════════════════
  (function checkLogin() {
      const user = sessionStorage.getItem("saved_username");
      if (!user) {
          window.location.href = 'login.html'; 
          return;
      }

      const FIVE_MINUTES = 5 * 60 * 1000; // 5 นาที

      function logout() {
          console.log("⏳ Session expired (5 mins idle). Logging out...");
          sessionStorage.removeItem("saved_username");
          sessionStorage.removeItem("lastActivity");
          window.location.href = 'login.html';
      }

      function resetTimer() {
          sessionStorage.setItem("lastActivity", new Date().getTime());
      }

      const lastActivity = sessionStorage.getItem("lastActivity");
      const now = new Date().getTime();

      if (lastActivity && (now - lastActivity > FIVE_MINUTES)) {
          logout();
          return;
      } else {
          resetTimer(); 
      }

      setInterval(() => {
          const checkNow = new Date().getTime();
          const actTime = sessionStorage.getItem("lastActivity");
          if (actTime && (checkNow - actTime > FIVE_MINUTES)) {
              logout();
          }
      }, 10000);

      window.addEventListener('mousemove', resetTimer);
      window.addEventListener('keydown', resetTimer);
      window.addEventListener('click', resetTimer);
      window.addEventListener('scroll', resetTimer);
  })();

  // ═══════════════════════════════════════════════
  // 📊 MAIN LOAD FUNCTION - ส่วนหลักที่ดึงข้อมูลจาก API
  // ═══════════════════════════════════════════════
  async function loadAll() {
    const loader = document.getElementById('loadingOverlay');
    const errorBanner = document.getElementById('errorBanner');
    const errorMsg = document.getElementById('errorMsg');

    if (loader) loader.style.display = 'flex';

    try {
      console.log(`📡 [${new Date().toLocaleTimeString()}] Fetching API...`);
      
      let url = `${PROXY}/api/overview`;

// ✅ ดึงค่าจาก date filter
      const start = document.getElementById('startDate')?.value;
      const end = document.getElementById('endDate')?.value;

      // ✅ ตรวจว่ามี filter ไหม
      const hasFilter = start && end;

      // ✅ ถ้ามี filter ให้ต่อ query string
      if (hasFilter) {
        url += `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
      }

      console.log(
        '📅 Current Filter:',
        hasFilter ? `${start} → ${end}` : 'ALL TIME'
      );

      const response = await fetch(url);
      console.log('📊 HTTP Status:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Data received:', data);

      // อัปเดต Dashboard UI ทั้งหมด
      updateDashboardUI(data);
      
      if (errorBanner) errorBanner.style.display = 'none';
      
      console.log('🎨 Dashboard updated successfully');

    } catch (err) {
      console.error('❌ Error:', err.message);
      
      if (errorBanner) {
        errorBanner.style.display = 'flex';
        errorMsg.textContent = `⚠️ ${err.message} - Retrying...`;
      }
    } finally {
      if (loader) loader.style.display = 'none';
      updateTimestamp();
    }
  }

  // ═══════════════════════════════════════════════
// 🔴 LOAD ONLY CRITICAL ALERTS CARD
// ═══════════════════════════════════════════════
async function loadCriticalAlertsOnly() {

  try {

    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;

    let url = `${PROXY}/api/overview`;

    if (start && end) {
      url += `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    }

    console.log('🔴 Loading ONLY Critical Alerts');

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // ✅ อัปเดตเฉพาะ Critical Alerts
    setTxt('critCount', data.totalCriticalAlerts || 0);

    // sparkline
    //if (data.eventTrend) {
      //drawSparkline('sparkCrit', data.eventTrend, '#ff4d4f');
    //}

  } catch (err) {

    console.error('❌ Critical Alerts Error:', err);

  }
}
  // ═══════════════════════════════════════════════
  // 🎨 UPDATE DASHBOARD UI
  // ═══════════════════════════════════════════════
  function updateDashboardUI(data) {
    if (!data) return;

    // ► KPI Cards - ตัวเลขใหญ่ๆ ตรงบน
    if (data.totalCriticalAlerts === null || data.totalCriticalAlerts === undefined) {
      setTxt('critCount', '-');
    } else {
      setTxt('critCount', data.totalCriticalAlerts);
    }
    setTxt('totalEvents', data.totalEvents || 0);
    setTxt('activeCount', data.agents?.active || 0);
    setTxt('disconnCount', data.agents?.disconnected || 0);


    // ► Severity breakdown
    setTxt('sevCrit', data.severity?.critical || 0);
    setTxt('sevHigh', data.severity?.high || 0);
    setTxt('sevMed', data.severity?.medium || 0);
    setTxt('sevLow', data.severity?.low || 0);


    // ► Donut Chart - Agents
    drawDonut(data.agents?.active || 0, data.agents?.disconnected || 0);
    
    console.log('📊 Updating 3 cards with data:');
    console.log('   - topAlertTypes:', data.topAlertTypes);
    console.log('   - topMitre:', data.topMitre);
    console.log('   - topAgents:', data.topAgents);
    
    // ✅ เรียกฟังก์ชันเรนเดอร์ข้อมูลลงตารางและกราฟวงกลมครบทุก Card
    drawPieTypes(data.topAlertTypes || []);      // CARD 1: Top 5 Alert Types
    drawPieMitre(data.topMitre || []);           // CARD 2: Top 10 MITRE
    renderAgentsTable(data.topAgents || []);     // CARD 3: Top 5 Agents List (เพิ่มให้เปิดใช้งานจริง)
    renderAlerts(data.latestAlerts || [], data.wazuhDashboardUrl || "https://172.15.0.38/");
  }

  // ═══════════════════════════════════════════════
  // 📋 RENDER TABLES / LISTS
  // ═══════════════════════════════════════════════

  // ► CARD 3: Render Agents List 🖥️
  function renderAgentsTable(agents) {
    const list = document.getElementById('agentsList');
    if (!list) return;
    
    console.log('📋 Rendering Agents Table:', agents);
    
    if (!agents || agents.length === 0) {
      list.innerHTML = '<li style="color:#999;text-align:center;padding:20px">No agents available</li>';
      return;
    }
    
    list.innerHTML = agents.map((a, i) => `
      <li>
        <span class="agent-rank">${i + 1}</span>
        <span class="agent-icon">🖥️</span>
        <span class="agent-name">${a.name || '-'}</span>
        <span class="agent-events">${(a.events || 0).toLocaleString('th-TH')}</span>
      </li>`).join('');
  }

  // ► Render Alerts Table (รวม Logic Deep Link จากโค้ดซ้ำซ้อนให้จบในตัวเดียว)
  function renderAlerts(alerts, wazuhUrl) {
    const body = document.getElementById('alertsBody');
    if (!body) return;

    body.innerHTML = (alerts || []).map(a => {
      const lvl = a.level || 0;
      const cls = lvl >= 12 ? 'lvl-crit' : lvl >= 7 ? 'lvl-8' : lvl >= 5 ? 'lvl-5' : 'lvl-3';
      const ts = a.timestamp ? a.timestamp.replace('T', ' ').substring(0, 23) : '-';
      const desc = (a.description || '-').substring(0, 40);
      
      // ✅ เลือกสร้าง URL ค้นหาเจาะจงราย Log ตามเงื่อนไขที่มีอยู่ทั้งหมดอย่างสมบูรณ์
      let targetUrl = wazuhUrl;
      if (a.docId && a.docIndex) {
        targetUrl = `https://172.15.0.38/app/discover#/doc/wazuh-alerts-*/${a.docIndex}?id=${a.docId}`;
      } else if (a.docId) {
        const searchQuery = encodeURIComponent(`_id:"${a.docId}"`);
        targetUrl = `https://172.15.0.38/app/discover#/?_g=(filters:!(),refreshInterval:(pause:!t,value:0),time:(from:now-7d,to:now))&_a=(columns:!(_source),filters:!(),index:'wazuh-alerts-*',interval:auto,query:(language:kuery,query:'${searchQuery}'),sort:!())`;
      }
      
      return `<tr>
        <td class="ts">${ts}</td>
        <td><span class="level-badge ${cls}">${lvl}</span></td>
        <td style="font-family:monospace;font-size:11px">${a.ruleId || '-'}</td>
        <td class="truncate" title="${a.description || '-'}">${desc}</td>
        <td><strong>${a.agentName || '-'}</strong></td>
        <td><a class="view-link" href="${targetUrl}" target="_blank">View in Wazuh ↗</a></td>
      </tr>`;
    }).join('');
    
    if (alerts.length === 0) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999">No alerts</td></tr>';
    }
  }

  // ═══════════════════════════════════════════════
  // 🛠️ HELPER FUNCTIONS
    // ═══════════════════════════════════════════════
    function setTxt(id, val) {
    const el = document.getElementById(id);
    if (!el) return;

    // ✅ แสดง "-" ได้จริง
    if (val === '-' || val === null || val === undefined) {
      el.textContent = '-';
      return;
    }

    if (typeof val === 'number') {
      el.textContent = val.toLocaleString('th-TH');
    } else {
      el.textContent = String(val);
    }
  }

  function updateTimestamp() {
    const el = document.getElementById('lastUpdate');
    if (el) {
      const now = new Date();
      el.textContent = now.toLocaleTimeString('th-TH');
    }
  }

  // ═══════════════════════════════════════════════
// 📊 CHART RENDERING FUNCTIONS
// ═══════════════════════════════════════════════
const PIE_COLORS = [
  '#ff8e2b', // orange
  '#ffa200', // amber
  '#f9b700eb', // dark orange
  '#ffd54f', // yellow
  '#ffe082'  // light yellow
];

const TEAL_SHADES = [
  '#54d7e8', // cyan
  '#00acc1',
  '#0097a7',
  '#00838f',
  '#00796b',
  '#00897b',
  '#26a69a',
  '#4db6ac',
  '#80cbc4',
  '#939292'
];

let donutChart, pieTypesChart, pieMitreChart;

function drawSparkline(canvasId, data, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  canvas.width = 90;
  canvas.height = 36;
  
  if (!data || data.length === 0) {
    ctx.clearRect(0, 0, 90, 36);
    return;
  }
  
  const mx = Math.max(...data);
  const mn = Math.min(...data);
  const range = mx - mn || 1;
  
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * 90,
    y: 36 - ((v - mn) / range) * 32 - 2
  }));
  
  ctx.clearRect(0, 0, 90, 36);
  
  ctx.beginPath();
  ctx.moveTo(pts[0].x, 36);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, 36);
  ctx.fillStyle = color + '33';
  ctx.fill();
  
  ctx.beginPath();
  pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.stroke();
}

function drawDonut(active, disconnected) {
  const el = document.getElementById('donutAgents');
  if (!el) return;
  
  if (donutChart) donutChart.destroy();
  
  donutChart = new Chart(el.getContext('2d'), {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [active, disconnected],
        backgroundColor: ['#4c6ef5', '#e53e3e'],
        borderWidth: 0,
        borderColor: 'transparent'
      }]
    },
    options: {
      cutout: '70%',
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    }
  });
}

function drawPieTypes(data) {
  const el = document.getElementById('pieAlertTypes');
  if (!el) return;
  
  console.log('🎨 Drawing Alert Types Chart:', data);
  if (pieTypesChart) pieTypesChart.destroy();
  
  if (!data || data.length === 0) {
    const legend = document.getElementById('alertTypesLegend');
    if (legend) {
      legend.innerHTML = '<div class="legend-item" style="color:#999">No data available</div>';
    }
    return;
  }
  
  pieTypesChart = new Chart(el.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.name),
      datasets: [{
        data: data.map(d => d.count),
        backgroundColor: PIE_COLORS.slice(0, data.length),
        borderWidth: 0.5
      }]
    },
    options: {
      cutout: '55%',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: 8,
          titleFont: { size: 12 },
          bodyFont: { size: 11 }
        }
      }
    }
  });
  
  const legend = document.getElementById('alertTypesLegend');
  if (legend) {
    legend.innerHTML = data.map((d, i) => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>
        <span class="legend-name">${d.name.substring(0, 25)}</span>
        <span class="legend-count">(${d.count.toLocaleString('th-TH')})</span>
      </div>`).join('');
  }
}

function drawPieMitre(data) {
  const el = document.getElementById('pieMitre');
  if (!el) return;
  
  console.log('🎨 Drawing MITRE Chart:', data);
  if (pieMitreChart) pieMitreChart.destroy();
  
  if (!data || data.length === 0) {
    const list = document.getElementById('mitreList');
    if (list) {
      list.innerHTML = '<div class="legend-item" style="color:#999">No data available</div>';
    }
    return;
  }
  
  pieMitreChart = new Chart(el.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.name),
      datasets: [{
        data: data.map(d => d.count),
        backgroundColor: TEAL_SHADES.slice(0, data.length),
        borderWidth: 0
      }]
    },
    options: {
      cutout: '55%',
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: 8,
          titleFont: { size: 12 },
          bodyFont: { size: 11 }
        }
      }
    }
  });
  
  const list = document.getElementById('mitreList');
  if (list) {
    list.innerHTML = data.map((d, i) => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${TEAL_SHADES[i % TEAL_SHADES.length]}"></span>
        <span class="legend-name">${d.name}</span>
        <span class="legend-count">(${d.count.toLocaleString('th-TH')})</span>
      </div>`).join('');
  }
}

// ═══════════════════════════════════════════════
// 🔌 API DROPDOWN MENU
// ═══════════════════════════════════════════════

const apiBtn = document.getElementById('apiBtn');
const apiMenu = document.getElementById('apiMenu');

if (apiBtn && apiMenu) {

    apiBtn.addEventListener('click', function(e) {

    e.stopPropagation();

    // ปิด profile dropdown ก่อน
    if (profileMenu) {
        profileMenu.classList.remove('show');
    }

    apiMenu.classList.toggle('show');
    apiBtn.classList.toggle('active');

});

    apiMenu.addEventListener('click', function(e) {
        e.stopPropagation();
    });

}

// เปลี่ยน API
function changeAPI(apiName) {

    const apiLabel = document.getElementById('apiDefault');

    if (apiLabel) {
        apiLabel.innerText = apiName;
    }

    apiMenu.classList.remove('show');
    apiBtn.classList.remove('active');

    console.log("Switched to API:", apiName);

}

// กดที่อื่น = ปิด dropdown
window.addEventListener('click', function() {

    if (apiMenu.classList.contains('show')) {

        apiMenu.classList.remove('show');
        apiBtn.classList.remove('active');

    }

});

// ═══════════════════════════════════════════════
// 👤 PROFILE DROPDOWN MENU
// ═══════════════════════════════════════════════
const profileBtn = document.getElementById("profileBtn");
const profileMenu = document.getElementById("profileMenu");

if (profileBtn && profileMenu) {

  profileBtn.addEventListener("click", function (e) {

  e.stopPropagation();

  // ปิด API dropdown ก่อน
  if (apiMenu) {
    apiMenu.classList.remove('show');
    apiBtn.classList.remove('active');
  }

  profileMenu.classList.toggle("show");

});

  window.addEventListener("click", function () {
    profileMenu.classList.remove("show");
  });

}
// ฟังก์ชันสำหรับ Logout (ดึงมาจากที่เคยทำไว้)
function logout() {
    console.log("🚪 Logging out...");
    sessionStorage.clear();
    window.location.href = 'login.html';
}

// กดที่อื่นในหน้าเว็บให้เมนูโปรไฟล์ปิดอัตโนมัติ
window.addEventListener('click', function() {
    if (profileMenu && profileMenu.classList.contains('show')) {
        profileMenu.classList.remove('show');
    }
});

// ฟังก์ชันจัดการ Popup
function openRolesPopup() {
  document.getElementById('rolesPopup').style.display = 'flex';
  profileMenu.classList.remove('show'); // ปิดเมนูโปรไฟล์เมื่อเปิด Popup
}

function closePopup() {
  document.getElementById('rolesPopup').style.display = 'none';
}

// ปิด Popup เมื่อคลิกพื้นที่ว่างรอบๆ
window.addEventListener('click', function(event) {
  const modal = document.getElementById('rolesPopup');
  if (event.target == modal) {
    closePopup();
  }
});
  // ═══════════════════════════════════════════════
  // 🖱️ CLICKABLE SEVERITY BOXES
  // ═══════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.sev-box.clickable').forEach(box => {
      box.style.cursor = 'pointer';

      box.addEventListener('click', () => {
        const url = box.dataset.url;
        if (url) {
          window.open(url, '_blank');
        }
      });
    });
  });
  // ═══════════════════════════════════════════════
  // 🔄 INITIALIZATION & AUTO-REFRESH
  // ═══════════════════════════════════════════════
// ✅ Apply button for Critical Alerts ONLY
document.addEventListener('DOMContentLoaded', () => {

  const applyBtn = document.getElementById('applyDateFilter');

  if (applyBtn) {

    applyBtn.addEventListener('click', () => {

      loadCriticalAlertsOnly();

    });

  }

});
  // ═══════════════════════════════════════
  // 📅 DATE RANGE FILTER
  // ═══════════════════════════════════════

  function formatDateLocal(date) {
    const pad = n => String(n).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  function formatDisplayDate(dateString) {

  if (!dateString) return '-';

  const date = new Date(dateString);

  const pad = n => String(n).padStart(2, '0');

  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();

  const hours = pad(date.getHours());
  const mins = pad(date.getMinutes());

  // ✅ DD/MM/YYYY @ HH:mm
  return `${day}/${month}/${year} @ ${hours}:${mins}`;
}


  function setPresetRange(type) {
    const end = new Date();
    const start = new Date();

    switch(type) {

      case '24h':
        start.setHours(start.getHours() - 24);
        break;

      case '7d':
        start.setDate(start.getDate() - 7);
        break;

      case '30d':
        start.setMonth(start.getMonth() - 1);
        break;

      case '1y':
        start.setFullYear(start.getFullYear() - 1);
        break;
    }

    document.getElementById('startDate').value = formatDateLocal(start);
    document.getElementById('endDate').value = formatDateLocal(end);
  }

  // apply filter
  document.addEventListener('DOMContentLoaded', () => {

    // default = 24h
    //setPresetRange('24h');

    // preset buttons
    document.querySelectorAll('.time-btn').forEach(btn => {

      btn.addEventListener('click', () => {

  document.querySelectorAll('.time-btn')
    .forEach(b => b.classList.remove('active'));

  btn.classList.add('active');

  setPresetRange(btn.dataset.range);

  // ✅ อัปเดตข้อความช่วงเวลา
  const start = document.getElementById('startDate').value;
  const end = document.getElementById('endDate').value;

  const rangeText = document.getElementById('selectedRangeText');

  if (rangeText) {
    rangeText.textContent =
      `@ ${formatDisplayDate(start)} → ${formatDisplayDate(end)}`;
  }

  // ✅ โหลดใหม่ทันที
  loadCriticalAlertsOnly();
    });
    }
  )
  });

  // แก้ไขปีกกาปิดที่พัง และแยกเหตุการณ์ onload ออกมาให้ถูกต้องตามมาตรฐาน
  window.onload = () => {
    console.log('🚀 Dashboard initializing...');

    const user = sessionStorage.getItem("saved_username");
    const lastActivity = sessionStorage.getItem("lastActivity");

    const now = new Date().getTime();
    const FIVE_MINUTES = 5 * 60 * 1000;

    if (!user || (lastActivity && (now - lastActivity > FIVE_MINUTES))) {

        sessionStorage.removeItem("saved_username");
        sessionStorage.removeItem("lastActivity");

        window.location.href = 'login.html';

    } else {

        // ✅ ล้าง filter ทั้งหมดตอนรีเฟรช
        const startInput = document.getElementById('startDate');
        const endInput = document.getElementById('endDate');

        if (startInput) startInput.value = '';
        if (endInput) endInput.value = '';

        // ✅ เอา active ออกจากทุกปุ่มเวลา
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // ✅ reset ข้อความ range
        const rangeText = document.getElementById('selectedRangeText');
        if (rangeText) {
            rangeText.textContent = '@ ALL TIME';
        }

        // โหลดข้อมูลใหม่แบบ ALL TIME
        loadAll();

        if (typeof fetchWazuhAgents === 'function') {
            fetchWazuhAgents();
        }
    }
};

  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      console.log('👆 Manual refresh clicked');
      loadAll();
    });
  }

  // ================================
  // CLICKABLE CARDS
  // ================================
  document.querySelectorAll('[data-url]').forEach(el => {
    el.style.cursor = 'pointer';

    el.addEventListener('click', function (e) {
      e.stopPropagation();

      const url = this.getAttribute('data-url');
      if (url) {
        window.open(url, '_blank');
      }
    });
  });
  
function openCriticalAlerts() {
  const url = `https://172.15.0.38/app/data-explorer/discover#?_a=(discover:(columns:!(_source),isDirty:!f,sort:!()),metadata:(indexPattern:'wazuh-alerts-*',view:discover))&_g=(filters:!(('$state':(store:globalState),meta:(alias:!n,disabled:!f,index:'wazuh-alerts-*',key:rule.level,negate:!f,params:(gte:15,lte:!n),type:range),range:(rule.level:(gte:15,lte:!n)))),refreshInterval:(pause:!t,value:0),time:(from:now-24h,to:now))&_q=(filters:!(),query:(language:kuery,query:''))`;

  window.open(url, '_blank');
}