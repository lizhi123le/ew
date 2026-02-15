/**
 * 简单域名检测 - 只用DNS解析
 * 支持两种格式：
 *   1. 对象格式: { "api_site": { "key": { "api": "...", "name": "..." } } }
 *   2. 数组格式: [ { "id": "...", "name": "...", "baseUrl": "..." } ]
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');

// 默认检测的文件
const CONFIG_FILE = process.argv[2] || path.join(__dirname, 'yuan', 'k - 副本.json');

const stats = { total: 0, valid: 0, invalid: 0, checked: 0, validIds: new Set(), invalidList: [], isArray: false };

function checkDomain(hostname) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ valid: false, error: '超时' });
    }, 2000);

    dns.resolve4(hostname, (err) => {
      clearTimeout(timeout);
      resolve({ valid: !err, error: err ? 'DNS失败' : null });
    });
  });
}

async function main() {
  console.log('='.repeat(50));
  console.log('检测域名有效性');
  console.log('='.repeat(50));
  console.log(`检测文件: ${CONFIG_FILE}\n`);

  const rawData = fs.readFileSync(CONFIG_FILE, 'utf8');
  const data = JSON.parse(rawData);

  // 检测格式
  let sites = [];
  if (Array.isArray(data)) {
    stats.isArray = true;
    sites = data.map(item => ({ key: item.id, ...item }));
  } else {
    sites = Object.entries(data.api_site || {}).map(([key, value]) => ({ key, ...value, api: value.api, name: value.name }));
  }

  const keys = sites.map(s => s.key);
  stats.total = keys.length;
  console.log(`总源数: ${stats.total}\n`);

  for (const site of sites) {
    stats.checked++;
    try {
      const url = new URL(site.api || site.baseUrl);
      const result = await checkDomain(url.hostname);

      if (result.valid) {
        stats.valid++;
        // 有效的源ID加入 Set
        stats.validIds.add(site.key);
      } else {
        stats.invalid++;
        // 无效的源记录
        stats.invalidList.push({ key: site.key, name: site.name, api: site.api || site.baseUrl, domain: url.hostname, error: result.error });
      }
    } catch (e) {
      stats.invalid++;
      stats.invalidList.push({ key: site.key, name: site.name, api: site.api || site.baseUrl, error: e.message });
    }

    // 进度
    process.stdout.write(`\r${stats.checked}/${stats.total} 有效:${stats.valid} 无效:${stats.invalid}`);
  }

  console.log('\n\n' + '='.repeat(50));
  console.log(`结果: 有效 ${stats.valid} | 无效 ${stats.invalid}`);
  console.log('='.repeat(50));

  if (stats.invalidList.length > 0) {
    console.log('\n无效域名:');
    stats.invalidList.forEach((s, i) => {
      console.log(`${i+1}. [${s.domain || 'unknown'}] ${s.name} - ${s.error}`);
    });
  }

  // 生成新配置
  let newConfig;
  if (stats.isArray) {
    // 数组格式 - 保持原始顺序，移除无效源
    const result = [];
    let priority = 1;
    data.forEach(item => {
      // 检查这个源是否有效（通过比对域名）
      const url = new URL(item.baseUrl);
      const isValid = !stats.invalidList.some(inv => inv.domain === url.hostname && inv.key === item.id);
      if (isValid) {
        result.push({
          ...item,
          priority: priority++
        });
      }
    });
    newConfig = result;
  } else {
    // 对象格式
    newConfig = {
      cache_time: data.cache_time,
      api_site: {}
    };
    for (const [key, value] of Object.entries(data.api_site || {})) {
      if (stats.validIds.has(key)) {
        newConfig.api_site[key] = value;
      }
    }
  }

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2));

  console.log('\n✅ 已更新文件');
  console.log(`📊 剩余有效源: ${stats.valid}`);
  console.log(`🗑️  已移除: ${stats.invalid}`);
}

main();
