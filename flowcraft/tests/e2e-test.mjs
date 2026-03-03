#!/usr/bin/env node
/**
 * 端到端測試腳本
 * 測試前端 → 後端 → WebSocket 整個流程
 *
 * 使用方式: node tests/e2e-test.js
 */

import http from 'http';
import { io } from 'socket.io-client';

const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:3001';
const TEST_TIMEOUT = 10000;

let testsPassed = 0;
let testsFailed = 0;

function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

function pass(message) {
  testsPassed++;
  log('✅', message);
}

function fail(message, error) {
  testsFailed++;
  log('❌', message);
  if (error) console.error('   Error:', error.message || error);
}

// 測試 1: 檢查前端是否運行
async function testFrontendRunning() {
  return new Promise((resolve) => {
    http.get(FRONTEND_URL, (res) => {
      if (res.statusCode === 200) {
        pass('前端運行正常 (port 5173)');
        resolve(true);
      } else {
        fail(`前端回應異常 (status ${res.statusCode})`);
        resolve(false);
      }
    }).on('error', (err) => {
      fail('前端未運行', err);
      resolve(false);
    });
  });
}

// 測試 2: 檢查後端是否運行
async function testBackendRunning() {
  return new Promise((resolve) => {
    http.get(`${BACKEND_URL}/api/health`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'ok') {
            pass('後端運行正常 (port 3001)');
            resolve(true);
          } else {
            fail('後端健康檢查失敗');
            resolve(false);
          }
        } catch (err) {
          fail('後端回應格式錯誤', err);
          resolve(false);
        }
      });
    }).on('error', (err) => {
      fail('後端未運行', err);
      resolve(false);
    });
  });
}

// 測試 3: 檢查 CORS 設定
async function testCORS() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/health',
      method: 'GET',
      headers: {
        'Origin': 'http://localhost:5173'
      }
    };

    const req = http.request(options, (res) => {
      const corsHeader = res.headers['access-control-allow-origin'];
      if (corsHeader === 'http://localhost:5173') {
        pass('CORS 設定正確');
        resolve(true);
      } else {
        fail(`CORS 設定錯誤: ${corsHeader}`);
        resolve(false);
      }
    });

    req.on('error', (err) => {
      fail('CORS 測試失敗', err);
      resolve(false);
    });

    req.end();
  });
}

// 測試 4: WebSocket 連線
async function testWebSocket() {
  return new Promise((resolve) => {
    const socket = io(BACKEND_URL, {
      transports: ['websocket'],
      reconnection: false
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      fail('WebSocket 連線超時');
      resolve(false);
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      pass(`WebSocket 連線成功 (socket.id: ${socket.id})`);
      socket.disconnect();
      resolve(true);
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      fail('WebSocket 連線失敗', err);
      resolve(false);
    });
  });
}

// 測試 5: 工作流執行 API
async function testWorkflowExecution() {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      workflow: {
        id: 'e2e-test',
        name: 'E2E Test',
        nodes: [
          {
            id: 'node-1',
            type: 'manual-trigger',
            position: { x: 100, y: 200 },
            data: { payload: '{"test": true}' }
          }
        ],
        edges: []
      },
      socketId: 'test-socket'
    });

    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/workflow/run',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Origin': 'http://localhost:5173'
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(responseData);
          if (json.ok && json.executionId) {
            pass(`工作流執行 API 正常 (executionId: ${json.executionId})`);
            resolve(true);
          } else {
            fail('工作流執行 API 回應異常', json);
            resolve(false);
          }
        } catch (err) {
          fail('工作流執行 API 回應格式錯誤', err);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
      fail('工作流執行 API 請求失敗', err);
      resolve(false);
    });

    req.write(data);
    req.end();
  });
}

// 測試 6: 完整的執行流程（包含 WebSocket 事件）
async function testFullWorkflowExecution() {
  return new Promise((resolve) => {
    const socket = io(BACKEND_URL, {
      transports: ['websocket'],
      reconnection: false
    });

    const receivedEvents = [];
    const timeout = setTimeout(() => {
      socket.disconnect();
      fail('完整工作流執行超時');
      console.log('   已接收事件:', receivedEvents);
      resolve(false);
    }, TEST_TIMEOUT);

    socket.on('connect', () => {
      // 發送執行請求
      const data = JSON.stringify({
        workflow: {
          id: 'full-test',
          name: 'Full E2E Test',
          nodes: [
            {
              id: 'node-1',
              type: 'manual-trigger',
              position: { x: 100, y: 200 },
              data: { payload: '{"url": "https://example.com"}' }
            }
          ],
          edges: []
        },
        socketId: socket.id
      });

      const options = {
        hostname: 'localhost',
        port: 3001,
        path: '/api/workflow/run',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      const req = http.request(options, () => {});
      req.write(data);
      req.end();
    });

    socket.on('execution:start', () => receivedEvents.push('execution:start'));
    socket.on('node:start', () => receivedEvents.push('node:start'));
    socket.on('node:log', () => receivedEvents.push('node:log'));
    socket.on('node:done', () => receivedEvents.push('node:done'));

    socket.on('execution:complete', () => {
      receivedEvents.push('execution:complete');
      clearTimeout(timeout);
      socket.disconnect();

      const expectedEvents = ['execution:start', 'node:start', 'node:log', 'node:done', 'execution:complete'];
      const allEventsReceived = expectedEvents.every(e => receivedEvents.includes(e));

      if (allEventsReceived) {
        pass('完整工作流執行成功（所有 WebSocket 事件正常）');
        resolve(true);
      } else {
        fail('部分 WebSocket 事件缺失');
        console.log('   預期:', expectedEvents);
        console.log('   實際:', receivedEvents);
        resolve(false);
      }
    });

    socket.on('execution:failed', (data) => {
      clearTimeout(timeout);
      socket.disconnect();
      fail('工作流執行失敗', data.error);
      resolve(false);
    });
  });
}

// 執行所有測試
async function runAllTests() {
  console.log('\n🧪 flowcraft 端到端測試\n');
  console.log('='.repeat(50));

  const tests = [
    { name: '測試 1: 前端運行', fn: testFrontendRunning },
    { name: '測試 2: 後端運行', fn: testBackendRunning },
    { name: '測試 3: CORS 設定', fn: testCORS },
    { name: '測試 4: WebSocket 連線', fn: testWebSocket },
    { name: '測試 5: 工作流執行 API', fn: testWorkflowExecution },
    { name: '測試 6: 完整工作流執行', fn: testFullWorkflowExecution },
  ];

  for (const test of tests) {
    console.log(`\n${test.name}...`);
    await test.fn();
  }

  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 測試結果: ${testsPassed} 通過, ${testsFailed} 失敗\n`);

  if (testsFailed === 0) {
    console.log('🎉 所有測試通過！可以請用戶測試了。\n');
    process.exit(0);
  } else {
    console.log('⚠️  有測試失敗，請修復後再請用戶測試。\n');
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('測試執行失敗:', err);
  process.exit(1);
});
