  require('dotenv').config();
  const express = require('express');
  const axios = require('axios');
  const cors = require('cors');
  const path = require('path');
  const https = require('https');

  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    console.log('⚠️  TLS verification disabled');
  }

  const app = express();

  let lastLogTime = new Date().getTime();
  let accumulatedTotal = 0;
  let sparklineData = Array(12).fill(0);

  const PORT = process.env.PORT || 3001;
  const WAZUH_API  = process.env.WAZUH_API || '172.15.0.38';
  const WAZUH_PORT = process.env.WAZUH_PORT || '55000';
  const WAZUH_USER = process.env.WAZUH_USER || 'admin';
  const WAZUH_PASS = process.env.WAZUH_PASS || 'P@ssw0rd';

  // 🔴 เพิ่มรหัสผ่าน OpenSearch สำหรับพอร์ต 9200
  const OPENSEARCH_PASS = 'MfcdIB?vlE.GYjJ1WXMaF0MFv.Y?0dO.'; 

  const agent = new https.Agent({ 
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 20000
  });

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'frontend')));

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'login.html'));
  });

  app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
  });

  // ═══════════════════════════════════════════════
  // 🔐 AUTHENTICATION
  // ═══════════════════════════════════════════════
  async function getToken() {
    const auth = Buffer.from(`${WAZUH_USER}:${WAZUH_PASS}`).toString('base64');
    try {
      console.log(`🔐 Authenticating...`);
      const res = await axios.post(
        `https://${WAZUH_API}:${WAZUH_PORT}/security/user/authenticate`, 
        {}, 
        {
          headers: { 
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          },
          httpsAgent: agent,
          timeout: 20000
        }
      );
      console.log('✅ Token obtained');
      return res.data.data.token;
    } catch (err) {
      console.error('❌ Auth Error:', err.message);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════
  // 📊 DATA FETCHING - ✅ REAL DATA FROM 9200
  // ═══════════════════════════════════════════════

  // ► 1. Fetch Events (เปลี่ยนไปดึงพอร์ต 9200 จะได้ไม่ติด Error 405)
  async function fetchEvents(limit = 100, start = null, end = null) {
    console.log('📊 Fetching REAL events from OpenSearch...');
    const opensearchAuth = Buffer.from(`admin:${OPENSEARCH_PASS}`).toString('base64');
    
    try {
      const res = await axios.post(
        `https://${WAZUH_API}:9200/wazuh-alerts-*/_search?ignore_unavailable=true`,
        {
          size: limit,
          sort: [{ "@timestamp": { order: "desc", unmapped_type: "date" } }],
          query: {
            bool: {
              filter: [
                {
                  range: {
                    "@timestamp": {
                      gte: start || "now-24h",
                      lte: end || "now"
                    }
                  }
                }
              ]
            }
          }
        },
        {
          headers: { 'Authorization': `Basic ${opensearchAuth}`, 'Content-Type': 'application/json' },
          httpsAgent: agent,
          timeout: 15000
        }
      );

      const hits = res.data.hits?.hits || [];
      let newCount = 0;
      let maxTime = lastLogTime;

      const alerts = hits.map((hit) => {
        const source = hit._source;
        const timestamp = source.timestamp || source['@timestamp'];
        const time = new Date(timestamp).getTime();

        if (time > lastLogTime) {
          newCount++;
          if (time > maxTime) maxTime = time;
        }

        return {
          docId: hit._id,         // ✅ ดึง ID อัตโนมัติจาก OpenSearch
          docIndex: hit._index,   // ✅ ดึงชื่อ Index อัตโนมัติ (เช่น wazuh-alerts-4.x-2026.05.19)
          timestamp: source.timestamp,
          level: source.rule?.level || 0,
          ruleId: source.rule?.id || '-',
          description: source.rule?.description || '-',
          agentName: source.agent?.name || 'Wazuh-Server'
        };
      });

      if (maxTime > lastLogTime) lastLogTime = maxTime;

      return { alerts: alerts, newCount: newCount };
    } catch (err) {
      console.warn('⚠️ Failed to fetch events:', err.message);
      return { alerts: [], newCount: 0 };
    }
  }

  // ► 2. Fetch Agent Status (ใช้พอร์ต 55000 เหมือนเดิม ถูกต้องแล้ว)
  async function fetchAgentStats(token) {
    console.log('📡 Fetching agent status...');
    try {
      const res = await axios.get(
        `https://${WAZUH_API}:${WAZUH_PORT}/agents/summary/status`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
          httpsAgent: agent,
          timeout: 15000
        }
      );

      const stats = res.data.data?.connection || {};
      console.log('✅ Agent stats retrieved');
      return stats;
    } catch (err) {
      console.warn('⚠️ Failed to fetch agent stats:', err.message);
      return { active: 0, disconnected: 0, total: 0 };
    }
  }

  // ► 3. Fetch Top Agents (ดึงของจริง เลิกสุ่ม Math.random)
  async function fetchTopAgents() {
    console.log('📈 Fetching REAL top agents...');
    const opensearchAuth = Buffer.from(`admin:${OPENSEARCH_PASS}`).toString('base64');
    
    try {
      const res = await axios.post(
        `https://${WAZUH_API}:9200/wazuh-alerts-*/_search?ignore_unavailable=true`,
        {
          size: 0,
          query: { bool: { filter: [{ range: { "timestamp": { gte: "now-24h" } } }] } },
          aggs: { top_agents: { terms: { field: "agent.name", size: 5 } } }
        },
        {
          headers: { 'Authorization': `Basic ${opensearchAuth}`, 'Content-Type': 'application/json' },
          httpsAgent: agent,
          timeout: 15000
        }
      );

      const buckets = res.data.aggregations?.top_agents?.buckets || [];
      const topAgents = buckets.map(b => ({ name: b.key, events: b.doc_count }));
      
      console.log('✅ Top agents:', topAgents.map(a => `${a.name}(${a.events})`).join(', '));
      return topAgents;
    } catch (err) {
      console.warn('⚠️ Failed to fetch top agents:', err.message);
      return [];
    }
  }

  // ► 4. Fetch Rules with MITRE (ดึงของจริงจาก OpenSearch)
async function fetchRulesWithMitre() {
  console.log('🎯 Fetching rules with MITRE...');
  const opensearchAuth = Buffer.from(`admin:${OPENSEARCH_PASS}`).toString('base64');
  
  try {
    const res = await axios.post(
      `https://${WAZUH_API}:9200/wazuh-alerts-*/_search?ignore_unavailable=true`,
      {
        size: 0,
        query: { bool: { filter: [{ range: { "timestamp": { gte: "now-24h" } } }] } },
        aggs: {
          //แก้อ.
          mitre_techniques: { terms: { field: "rule.mitre.technique", size: 10 } },
          frequent_alerts: { terms: { field: "rule.description", size: 5 } }
        }
      },
      {
        headers: { 'Authorization': `Basic ${opensearchAuth}`, 'Content-Type': 'application/json' },
        httpsAgent: agent,
        timeout: 15000
      }
    );
//แก้อ.
    const mitreBuckets =  res.data.aggregations?.mitre_techniques?.buckets || [];
    const alertBuckets = res.data.aggregations?.frequent_alerts?.buckets || [];

    const mitreArray = mitreBuckets.map(b => ({ name: b.key, count: b.doc_count }));
    const alertTypesArray = alertBuckets.map(b => ({
      name: b.key.length > 35 ? b.key.substring(0, 32) + "..." : b.key,
      count: b.doc_count
    }));

    return { mitreArray, alertTypesArray };
  } catch (err) {
    console.warn('⚠️ Failed to fetch rules:', err.message);
    return { mitreArray: [], alertTypesArray: [] };
  }
}

  // ═══════════════════════════════════════════════
  // 📈 STATISTICS CALCULATION (โค้ดดั้งเดิมของคุณ ถูกต้องแล้ว)
  // ═══════════════════════════════════════════════
  function calculateStats(alerts) {
    console.log('📊 Calculating stats...');

    const stats = {
      severity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      totalAlerts: alerts.length,
      criticalCount: 0,
      riskScore: 0
    };

    // ใช้ rule.level จาก Wazuh จริง
    alerts.forEach(alert => {
      const level = Number(alert.level || 0);

      if (level >= 15) {
        stats.severity.critical++;
        stats.criticalCount++;
      } else if (level >= 12) {
        stats.severity.high++;
      } else if (level >= 7) {
        stats.severity.medium++;
      } else {
        stats.severity.low++;
      }
    });

    // คำนวณ Risk Score
    const totalAlerts = alerts.length || 1;
    const riskPoints =
      (stats.severity.critical * 25) +
      (stats.severity.high * 15) +
      (stats.severity.medium * 8) +
      (stats.severity.low * 2);

    const maxPossiblePoints = totalAlerts * 25;
    stats.riskScore = Math.round((riskPoints / maxPossiblePoints) * 100);
    stats.riskScore = Math.max(0, Math.min(100, stats.riskScore));

    console.log('✅ Severity:', stats.severity);

    return stats;
  }

  async function fetchSeverityStats(start = null, end = null) {
    console.log('📊 Fetching real severity stats from OpenSearch...');

    const opensearchAuth = Buffer.from(`admin:${OPENSEARCH_PASS}`).toString('base64');

    try {
      const res = await axios.post(
        `https://${WAZUH_API}:9200/wazuh-alerts-*/_search?ignore_unavailable=true`,
        {
          size: 0,
          query: {
            bool: {
              filter: [
                {
                  range: {
                    "@timestamp": {
                      gte: "now-24h" ,
                      lte: end || "now"
                    }
                  }
                }
              ]
            }
          },
          aggs: {
            severity_ranges: {
              range: {
                field: "rule.level",
                ranges: [
                  { from: 15, key: "critical" },
                  { from: 12, to: 15, key: "high" },
                  { from: 7, to: 12, key: "medium" },
                  { from: 0, to: 7, key: "low" }
                ]
              }
            }
          }
        },
        {
          headers: {
            Authorization: `Basic ${opensearchAuth}`,
            'Content-Type': 'application/json'
          },
          httpsAgent: agent,
          timeout: 15000
        }
      );

      const buckets = res.data.aggregations?.severity_ranges?.buckets || [];

      const severity = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      };

      buckets.forEach(bucket => {
        severity[bucket.key] = bucket.doc_count;
      });

      console.log('✅ Real severity stats:', severity);

      return severity;
    } catch (err) {
      console.error('❌ Failed to fetch severity stats:', err.message);
      return {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      };
    }
  }

  // ═══════════════════════════════════════════════
// 🔴 TOTAL CRITICAL ALERTS (ALL TIME)
// ═══════════════════════════════════════════════
async function fetchTotalCriticalAlerts(start = null, end = null) {

  console.log('🔴 Fetching TOTAL critical alerts (all time)...');

  const opensearchAuth = Buffer.from(
    `admin:${OPENSEARCH_PASS}`
  ).toString('base64');

  try {

    const res = await axios.post(
      `https://${WAZUH_API}:9200/wazuh-alerts-*/_search?ignore_unavailable=true`,
      {
        size: 0,

        query: {
          bool: {
            filter: [
              {
                range: {
                  "@timestamp": {
                    gte: start || "now-100y",
                    lte: end || "now"
                  }
                }
              },
              {
                range: {
                  "rule.level": {
                    gte: 15
                  }
                }
              }
            ]
          }
        }
      },
      {
        headers: {
          Authorization: `Basic ${opensearchAuth}`,
          'Content-Type': 'application/json'
        },
        httpsAgent: agent,
        timeout: 15000
      }
    );

    const total =
      res.data.hits?.total?.value || 0;

    console.log('✅ Total Critical Alerts:', total);

    return total;

  } catch (err) {

    console.error(
      '❌ Failed to fetch total critical alerts:',
      err.message
    );

    return 0;
  }
}
  // ═══════════════════════════════════════════════
  // 🔌 MAIN API ENDPOINT ✅ UPDATED
  // ═══════════════════════════════════════════════
  // ═══════════════════════════════════════════════
  // 🔌 MAIN API ENDPOINT
  // ✅ Total Events = ผลรวมของ Critical + High + Medium + Low
  // ═══════════════════════════════════════════════
  app.get('/api/overview', async (req, res) => {
    try {
      console.log('\n📡 GET /api/overview');
      const { start, end } = req.query;

      const token = await getToken();

      const [
        eventsData,
        agentStats,
        topAgents,
        mitreData,
        severityData,
        totalCriticalAlerts
      ] =
        await Promise.all([
          fetchEvents(100, start, end),
          fetchAgentStats(token),
          fetchTopAgents(start, end),
          fetchRulesWithMitre(start, end),
          fetchSeverityStats(start, end),
          fetchTotalCriticalAlerts(start, end)
        ]);

      const alerts = eventsData.alerts;
      const stats = calculateStats(alerts);

      // ✅ คำนวณ Total Events จากผลรวมของ severity
      const totalEvents =
        (severityData.critical || 0) +
        (severityData.high || 0) +
        (severityData.medium || 0) +
        (severityData.low || 0);

      // ✅ จำนวน alert ใหม่ตั้งแต่ refresh ครั้งก่อน
      const newEventsCount = eventsData.newCount || 0;

      // ✅ Sparkline ใช้ข้อมูล totalEvents จริง
      sparklineData.shift();
      sparklineData.push(totalEvents);

      const responseData = {
        status: 'success',
        timestamp: new Date().toISOString(),

        // KPI Cards
        riskScore: stats.riskScore,
        // 🔴 ALL TIME
        totalCriticalAlerts: totalCriticalAlerts,
        // 🔴 FILTERED (24h / 7d / etc)
        criticalAlerts: severityData.critical,
        totalEvents: totalEvents,      // ✅ ใช้ยอดรวมจริงจาก Wazuh
        eventsDelta: newEventsCount,
        eventTrend: sparklineData,

        // Agents
        agents: {
          active: agentStats.active || 0,
          disconnected: agentStats.disconnected || 0,
          total: agentStats.total || 0
        },

        // Severity Breakdown
        severity: severityData,

        // Latest Alerts Table
        latestAlerts: alerts.slice(0, 5),

        // Bottom Cards
        topAlertTypes: mitreData.alertTypesArray,
        topMitre: mitreData.mitreArray,
        topAgents: topAgents,

        // Misc
        wazuhDashboardUrl: `https://${WAZUH_API}/`,
        dataSource: 'Wazuh API (Real-time)',
        alertsProcessed: totalEvents
      };

      console.log('✅ Total Events:', totalEvents);
      console.log('✅ Severity:', severityData);

      res.json(responseData);

    } catch (err) {
      console.error('❌ API Error:', err.message);
      res.status(500).json({
        error: 'Failed to fetch data',
        message: err.message
      });
    }
  });

  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      wazuh: { api: WAZUH_API, port: WAZUH_PORT }
    });
  });

  app.get('/api/wazuh-agents', async (req, res) => {
    try {
      const authRes = await axios.get(`https://${WAZUH_API}:${WAZUH_PORT}/security/user/authenticate`, {
        auth: { username: WAZUH_USER, password: WAZUH_PASS },
        httpsAgent: agent
      });
      const token = authRes.data.data.token;

      const agentsRes = await axios.get(`https://${WAZUH_API}:${WAZUH_PORT}/agents?limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` },
        httpsAgent: agent
      });
      res.json(agentsRes.data.data.affected_items);
    } catch (err) {
      console.error('❌ Error fetching Wazuh agents:', err.message);
      res.status(500).json({ error: "Failed to fetch real agents from Wazuh API" });
    }
  });

  app.listen(PORT, () => {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`✅ Wazuh Dashboard Server Started`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`📊 Data Source: Wazuh API (Real-time)`);
    console.log(`${'═'.repeat(70)}\n`);
  });