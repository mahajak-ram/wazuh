// ═══════════════════════════════════════════════
// 🔐 LOGIN CHECK & 5-MINUTES AUTOLOGOUT
// ═══════════════════════════════════════════════
(function checkLogin() {
    const user = sessionStorage.getItem("saved_username");
    if (!user) {
        window.location.href = 'login.html'; 
        return;
    }

    const FIVE_MINUTES = 5 * 60 * 1000; // 300,000 มิลลิวินาที (5 นาที)

    // ฟังก์ชันเคลียร์ค่าล็อกอินแล้วส่งกลับหน้า Login
    function logout() {
        console.log("⏳ Session expired (5 mins idle). Logging out...");
        sessionStorage.removeItem("saved_username");
        sessionStorage.removeItem("lastActivity");
        window.location.href = 'login.html';
    }

    // ฟังก์ชันรีเซ็ตค่านับเวลาใหม่เมื่อผู้ใช้ขยับหน้าจอ
    function resetTimer() {
        sessionStorage.setItem("lastActivity", new Date().getTime());
    }

    // ⚡ ตรวจสอบทันทีตอนเริ่มต้นโหลดสคริปต์หน้าเว็บ (เช่น ตอนกดปุ่ม Refresh หน้าจอ)
    const lastActivity = sessionStorage.getItem("lastActivity");
    const now = new Date().getTime();

    if (lastActivity && (now - lastActivity > FIVE_MINUTES)) {
        logout();
        return;
    } else {
        resetTimer(); // ถ้ายังไม่หมดเวลา ให้ตั้งต้นนับเวลาปัจจุบันใหม่
    }

    // ตั้งเวลาตรวจสอบความเคลื่อนไหวเบื้องหลัง (Background Thread) ทุก ๆ 10 วินาที
    setInterval(() => {
        const checkNow = new Date().getTime();
        const actTime = sessionStorage.getItem("lastActivity");
        if (actTime && (checkNow - actTime > FIVE_MINUTES)) {
            logout();
        }
    }, 10000);

    // 🎯 ดักจับเหตุการณ์: ถ้าผู้ใช้เลื่อนเมาส์, คลิก, พิมพ์งาน, สกอลหน้าจอ ถือว่ายังอยู่ให้รีเซ็ตเวลานับถอยหลังใหม่
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    window.addEventListener('scroll', resetTimer);
})();

const PROXY = 'http:172.16.0.43:3001'; 
let agentsData = []; // สร้างตัวแปรว่างๆ ไว้รับข้อมูลจริง

// 1. ฟังก์ชันดึงข้อมูลจริงจาก Server
async function fetchWazuhAgents() {
    try {
        const response = await fetch(`${PROXY}/api/wazuh-agents`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        let rawData = await response.json();
        
        // ❌ เอา Agent ID '000' ออกจากการแสดงผล
        agentsData = rawData.filter(agent => agent.id !== '000');
        
        console.log("✅ โหลดข้อมูล Agent จริงสำเร็จ:", agentsData.length, "เครื่อง (ไม่รวม 000)");

        // 📊 อัปเดตตัวเลขในการ์ดด้านบน
        updateNewStatCards();

        // 🛠️ เช็คก่อนว่า URL มีการแนบ ?status=... มา
        const urlParams = new URLSearchParams(window.location.search);
        const statusFilter = urlParams.get('status');
        
        const pageCountEl = document.getElementById('page-agent-count');

        if (statusFilter) {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = `status=${statusFilter.toLowerCase()}`;
            
            const filtered = agentsData.filter(agent => 
                (agent.status || '').toLowerCase() === statusFilter.toLowerCase()
            );

            if (pageCountEl) pageCountEl.innerText = `(${filtered.length})`;
            renderTable(filtered);
        } else {
            if (pageCountEl) pageCountEl.innerText = `(${agentsData.length})`;
            renderTable(agentsData);
        }

    } catch (error) {
        console.error("❌ Error fetching agents:", error);
    }
}

// 2. ฟังก์ชันอัปเดตตัวเลขและลิสต์ Top 5 (OS & Groups)
function updateNewStatCards() {
    const active = agentsData.filter(a => a.status === 'active').length;
    const disconnected = agentsData.filter(a => a.status === 'disconnected').length;

    const activeEl = document.getElementById('stat-active');
    const disconnectedEl = document.getElementById('stat-disconnected');

    if (activeEl) activeEl.innerText = active;
    if (disconnectedEl) disconnectedEl.innerText = disconnected;

    // --- จัดการ Top 5 OS ---
    // ตัวอย่างส่วนการนับ OS ที่ได้มาจาก agentsData
let osCounts = {};

agentsData.forEach(agent => {
    let osRaw = (agent.os && agent.os.name) ? agent.os.name : (typeof agent.os === 'string' ? agent.os : 'Unknown');
    
    let osName = osRaw;
    
    // 🛠️ ตรวจสอบถ้ามีคำว่า Windows ให้ยุบเหลือแค่ "Windows" สั้น ๆ ตัวเดียว
    if (osRaw.toLowerCase().includes('windows')) {
        osName = 'Windows';
    } else if (osRaw.toLowerCase().includes('ubuntu') || osRaw.toLowerCase().includes('linux')) {
        osName = 'Linux'; // (เผื่อไว้สำหรับยุบกลุ่ม Linux/Ubuntu ให้สั้นลงเหมือนกัน)
    }

    osCounts[osName] = (osCounts[osName] || 0) + 1;
});

// จากนั้นนำ osCounts นี้ไปวาดกราฟ Donut หรืออัปเดต UI รายการ Top 5 OS

    const topOS = Object.entries(osCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    // --- จัดการ Top 5 Groups ---
    const groupCounts = {};
    agentsData.forEach(agent => {
        if (Array.isArray(agent.group)) {
            agent.group.forEach(g => {
                groupCounts[g] = (groupCounts[g] || 0) + 1;
            });
        } else if (agent.group) {
            groupCounts[agent.group] = (groupCounts[agent.group] || 0) + 1;
        } else {
            groupCounts['Unassigned'] = (groupCounts['Unassigned'] || 0) + 1;
        }
    });

    const topGroups = Object.entries(groupCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    // เรนเดอร์ HTML Top 5 OS
    const osListEl = document.getElementById('top-os-list');
    if (osListEl) {
        osListEl.innerHTML = topOS.map(([name, count]) => {
            let icon = '<i class="fas fa-laptop text-gray-400 mr-2"></i>';
            if (name.toLowerCase().includes('windows')) icon = '<i class="fab fa-windows text-blue-500 mr-2"></i>';
            if (name.toLowerCase().includes('linux') || name.toLowerCase().includes('ubuntu') || name.toLowerCase().includes('centos')) icon = '<i class="fab fa-linux text-orange-500 mr-2"></i>';
            
            return `
                <li onclick="filterByCard('os', '${name}')" class="flex justify-between items-center p-2 hover:bg-blue-50 rounded cursor-pointer transition text-xs border-b border-gray-50 last:border-0">
                    <span class="text-gray-700 font-medium">${icon}${name}</span>
                    <span class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full text-[11px] font-semibold">${count}</span>
                </li>
            `;
        }).join('') || '<li class="text-gray-400 text-center py-2 text-xs">No data</li>';
    }

    // เรนเดอร์ HTML Top 5 Groups
    const groupsListEl = document.getElementById('top-groups-list');
    if (groupsListEl) {
        groupsListEl.innerHTML = topGroups.map(([name, count]) => `
            <li onclick="filterByCard('group', '${name}')" class="flex justify-between items-center p-2 hover:bg-blue-50 rounded cursor-pointer transition text-xs border-b border-gray-50 last:border-0">
                <span class="text-gray-700 font-medium"><i class="fas fa-folder text-yellow-500 mr-2"></i>${name}</span>
                <span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[11px] font-semibold">${count}</span>
            </li>
        `).join('') || '<li class="text-gray-400 text-center py-2 text-xs">No data</li>';
    }
}

// 🎯 แก้ไข: ฟังก์ชันสั่งกรองเมื่อคลิกที่ Card (แยกการทำงานออกมาให้ชัดเจน)
function filterByCard(type, value) {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        // สั่งให้พิมพ์ลงในช่องค้นหาตรง ๆ เช่น os=Windows หรือ group=default
        searchInput.value = `${type}=${value}`;
        
        // สั่งให้ระบบเริ่มประมวลผลฟิลเตอร์ทันทีเหมือนกับการกดปุ่มพิมพ์เอง
        searchInput.dispatchEvent(new Event('input')); 
    }
}

// 3. ฟังก์ชันวาดตาราง
function renderTable(data) {
    const tbody = document.getElementById('agents-tbody');
    const entriesInfo = document.getElementById('entries-info');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4 text-gray-500">No agents found</td></tr>';
        if (entriesInfo) entriesInfo.innerText = "Showing 0 entries";
        return;
    }

    data.forEach(agent => {
        const tr = document.createElement('tr');
        
        let statusClass = '';
        let rowClass = '';
        const statusStr = (agent.status || 'unknown').toLowerCase();
        
        if (statusStr === 'active') {
            statusClass = 'status-active';
        } else if (statusStr === 'disconnected') {
            statusClass = 'status-disconnected';
            rowClass = 'row-disconnected';
        } else {
            statusClass = 'bg-gray-400'; 
        }

        const osName = (agent.os && agent.os.name) ? agent.os.name : 'Unknown OS';
        const osVersion = (agent.os && agent.os.version) ? agent.os.version : '';
        const osFull = `${osName} ${osVersion}`.trim();
        const groupList = (agent.group && Array.isArray(agent.group)) ? agent.group.join(', ') : (agent.group || '-');
        
        // กำหนด Class ให้ตาราง (เพิ่ม cursor-pointer เพื่อให้เวลาเมาส์ชี้แล้วเปลี่ยนเป็นรูปมือ จะได้รู้ว่ากดได้ทั้งแถว)
        tr.className = `border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${rowClass}`;
        
        // 🎯 จุดสำคัญ: ฝังคำสั่งเปิดลิงก์ Wazuh จริงไว้ที่ตัวแถว (<tr>) เลย กดตรงไหนในแถวนี้ก็เด้งหมด
        tr.onclick = function() {
            window.open(`https://172.15.0.38/app/endpoints-summary#/agents?tab=welcome&agent=${agent.id}`, '_blank');
        };
        
        // โครงสร้างภายในตาราง (เอา onclick และไอคอนลิงก์ออกจากช่องชื่อแล้ว หน้าตาจะสะอาดเหมือนเดิมเป๊ะ)
        tr.innerHTML = `
            <td class="py-3 px-4 text-center" onclick="event.stopPropagation();"><input type="checkbox" class="rounded border-gray-300 shadow-sm"></td>
            <td class="py-3 px-2 font-medium text-gray-900">${agent.id || '-'}</td>
            <td class="py-3 px-2 text-blue-600 font-medium hover:underline">${agent.name || '-'}</td>
            <td class="py-3 px-2">${agent.ip || '-'}</td>
            <td class="py-3 px-2"><span class="group-badge">${groupList}</span></td>
            <td class="py-3 px-2">${osFull}</td>
            <td class="py-3 px-2">${agent.node_name || '-'}</td>
            <td class="py-3 px-2">${agent.version || '-'}</td>
            <td class="py-3 px-2 text-center">
                <div class="flex items-center justify-center space-x-1">
                    <span class="status-dot ${statusClass}"></span>
                    <span class="capitalize">${agent.status || '-'}</span>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (entriesInfo) {
        entriesInfo.innerText = `Showing 1 to ${data.length} of ${data.length} entries`;
    }
}

// 🎯 แก้ไข: ระบบช่องค้นหา Search (อัปเดตให้รองรับการคลิกจาก Card)
// 4. ระบบช่องค้นหา Search (อัปเดตให้รองรับการคลิกการ์ด OS และ Group)
// 🎯 แก้ไข: ระบบช่องค้นหา Search ให้กรองข้อมูลเมื่อกดการ์ดได้อย่างแม่นยำ
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        // ใช้ค่าข้อความดิบมาเช็ค เพื่อไม่ให้พิมพ์ใหญ่-เล็กมีปัญหาตอนเช็คตัวเริ่มต้น
        const rawKeyword = e.target.value.trim();
        
        // ถ้าช่องค้นหาว่างเปล่า ให้แสดงข้อมูลทั้งหมดทันที
        if (!rawKeyword) {
            renderTable(agentsData);
            return;
        }

        const filtered = agentsData.filter(agent => {
            const name = (agent.name || '').toLowerCase();
            const ip = (agent.ip || '').toLowerCase();
            const id = (agent.id || '').toLowerCase();
            const status = (agent.status || '').toLowerCase();
            
            // จัดการข้อมูล OS ของ Agent ให้เป็นตัวเล็กเพื่อใช้เปรียบเทียบ
            let osName = '';
            if (agent.os && agent.os.name) osName = agent.os.name.toLowerCase();
            else if (typeof agent.os === 'string') osName = agent.os.toLowerCase();

            // จัดการข้อมูล Group ของ Agent ให้เป็นตัวเล็กเพื่อใช้เปรียบเทียบ
            let groups = [];
            if (Array.isArray(agent.group)) {
                groups = agent.group.map(g => g.toLowerCase().trim());
            } else if (agent.group) {
                groups = [agent.group.toLowerCase().trim()];
            }

            // 🛠️ ตรวจจับกรณีคลิกการ์ด (เช่น os=Windows, group=default)
            if (rawKeyword.toLowerCase().startsWith('os=')) {
                const targetOS = rawKeyword.substring(3).toLowerCase().trim();
                return osName.includes(targetOS);
            }
            
            if (rawKeyword.toLowerCase().startsWith('group=')) {
                const targetGroup = rawKeyword.substring(6).toLowerCase().trim();
                // ค้นหาว่าในกลุ่มทั้งหมดของเครื่องนั้น มีคำที่ตรงกับที่คลิกมาหรือไม่
                return groups.some(g => g.includes(targetGroup) || g === targetGroup);
            }
            
            if (rawKeyword.toLowerCase().startsWith('status=')) {
                const targetStatus = rawKeyword.substring(7).toLowerCase().trim();
                return status === targetStatus;
            }

            // 🔍 สำหรับกรณีพิมพ์ค้นหาเองทั่วไปในช่อง Search
            const keyword = rawKeyword.toLowerCase();
            return name.includes(keyword) || 
                   ip.includes(keyword) || 
                   id.includes(keyword) || 
                   status.includes(keyword) ||
                   osName.includes(keyword) ||
                   groups.some(g => g.includes(keyword));
        });
        
        renderTable(filtered);
    });
}

// 5. สั่งให้เริ่มดึงข้อมูลทันทีเมื่อโหลดหน้าเว็บ
// 5. สั่งให้เริ่มทำงานเมื่อโหลดหน้าเว็บสำเร็จ (พร้อมดักตรวจสอบเวลาก่อนดึงข้อมูลจริง)
window.onload = () => {
    const user = sessionStorage.getItem("saved_username");
    const lastActivity = sessionStorage.getItem("lastActivity");
    const now = new Date().getTime();
    const FIVE_MINUTES = 5 * 60 * 1000;

    // 🛡️ เช็คซ้ำอีกชั้นตอนกดรีเฟรชหน้าเบราว์เซอร์ ถ้าปล่อยทิ้งไว้เกิน 5 นาทีจริง จะล็อกเอ้าท์ทันทีก่อนดึง API
    if (!user || (lastActivity && (now - lastActivity > FIVE_MINUTES))) {
        sessionStorage.removeItem("saved_username");
        sessionStorage.removeItem("lastActivity");
        window.location.href = 'login.html';
    } else {
        // หากเวลาผ่านไปไม่ถึงเกณฑ์ที่กำหนด ให้ทำงานดึงข้อมูล Agent ตามปกติ
        fetchWazuhAgents();
    }
};


// ═══════════════════════════════════════════════
// 👤 PROFILE DROPDOWN MENU
// ═══════════════════════════════════════════════
const profileBtn = document.getElementById("profileBtn");
const profileMenu = document.getElementById("profileMenu");

// ฟังก์ชันสำหรับ Logout (ดึงมาจากที่เคยทำไว้)
function logout() {
    console.log("🚪 Logging out...");
    sessionStorage.clear();
    window.location.href = 'login.html';
}


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
// 🌐 API DROPDOWN MENU
// ═══════════════════════════════════════════════
const apiBtn = document.getElementById('apiBtn');
const apiMenu = document.getElementById('apiMenu');
// ═══════════════════════════════════════════════
// 👤 PROFILE + API DROPDOWN MENU
// ═══════════════════════════════════════════════

// 👤 PROFILE
if (profileBtn && profileMenu) {

    profileBtn.addEventListener("click", function (e) {
        e.stopPropagation();

        // ปิด API menu
        if (apiMenu) {
            apiMenu.classList.remove("show");

            const apiArrow = apiBtn?.querySelector(".arrow");
            if (apiArrow) {
                apiArrow.style.transform = "rotate(0deg)";
            }
        }

        // toggle profile
        profileMenu.classList.toggle("show");
    });
}

// 🌐 API
if (apiBtn && apiMenu) {

    apiBtn.addEventListener("click", function (e) {
        e.stopPropagation();

        // ปิด profile menu
        if (profileMenu) {
            profileMenu.classList.remove("show");
        }

        // toggle api
        apiMenu.classList.toggle("show");

        // หมุนลูกศร
        const arrow = apiBtn.querySelector(".arrow");

        if (arrow) {
            if (apiMenu.classList.contains("show")) {
                arrow.style.transform = "rotate(180deg)";
            } else {
                arrow.style.transform = "rotate(0deg)";
            }
        }
    });
}

// ❌ คลิกพื้นที่อื่น = ปิดทั้งหมด
document.addEventListener("click", function () {

    if (profileMenu) {
        profileMenu.classList.remove("show");
    }

    if (apiMenu) {
        apiMenu.classList.remove("show");

        const arrow = apiBtn?.querySelector(".arrow");

        if (arrow) {
            arrow.style.transform = "rotate(0deg)";
        }
    }
});

// ฟังก์ชันเมื่อกดเลือกเมนู API (เช่น กดเลือก 'default')
function changeAPI(apiName) {
    const apiDefault = document.getElementById('apiDefault');
    if (apiDefault) {
        apiDefault.innerText = apiName;
    }
    
    // ปิดเมนูหลังเลือกเสร็จ
    if (apiMenu) {
        apiMenu.classList.remove('show');
    }
    
    // รีเซ็ตลูกศร
    const arrow = apiBtn.querySelector('.arrow');
    if (arrow) arrow.style.transform = 'rotate(0deg)';
    
    console.log("✅ Changed API to:", apiName);
    
    // หากต้องการให้ดึงข้อมูลใหม่เมื่อเปลี่ยน API สามารถเปิดคอมเมนต์บรรทัดล่างได้
    // fetchWazuhAgents(); 
}

// ═══════════════════════════════════════════════
// 📑 ระบบนับจำนวน Checkbox ที่ถูกเลือก (Selected Count)
// ═══════════════════════════════════════════════
(function initCheckboxCounter() {
    const selectAllCheckbox = document.getElementById('selectAll');
    const tbody = document.getElementById('agents-tbody');
    const selectedCountSpan = document.getElementById('selected-count');

    // ฟังก์ชันคำนวณและอัปเดตตัวเลขการเลือก
    function updateSelectedCount() {
        if (!tbody || !selectedCountSpan) return;

        const rowCheckboxes = tbody.querySelectorAll('input[type="checkbox"]');
        const checkedCount = tbody.querySelectorAll('input[type="checkbox"]:checked').length;

        if (checkedCount > 0) {
            selectedCountSpan.textContent = `${checkedCount} selected`;
            selectedCountSpan.classList.remove('hidden'); // แสดงป้ายนับจำนวน
        } else {
            selectedCountSpan.classList.add('hidden'); // ซ่อนป้ายเมื่อไม่มีการเลือก
        }

        // ตัวเลือกทั้งหมด (Master) จะติ๊กตามอัตโนมัติถ้าติ๊กครบทุกแถว
        if (selectAllCheckbox && rowCheckboxes.length > 0) {
            selectAllCheckbox.checked = (checkedCount === rowCheckboxes.length);
        }
    }

    // 1. เมื่อติ๊กเลือกทั้งหมด (Master Checkbox) ด้านบน
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            if (!tbody) return;
            const rowCheckboxes = tbody.querySelectorAll('input[type="checkbox"]');
            rowCheckboxes.forEach(cb => {
                cb.checked = this.checked;
            });
            updateSelectedCount();
        });
    }

    // 2. ดักจับเมื่อมีการติ๊กเลือกรายตัวในตาราง (Event Delegation)
    if (tbody) {
        tbody.addEventListener('change', function(e) {
            if (e.target && e.target.type === 'checkbox') {
                updateSelectedCount();
            }
        });
        
        // บังคับรีเซ็ตและอัปเดตค่าเมื่อตารางมีการเปลี่ยนแปลงข้อมูล (เช่น ค้นหา หรือ ฟิลเตอร์)
        const observer = new MutationObserver(() => {
            updateSelectedCount();
        });
        observer.observe(tbody, { childList: true });
    }
})();