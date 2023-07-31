const express = require('express');
const axios = require('axios');

const app = express();
const port = 9008;
const P = 1/6; // AML不通过的概率

app.use(express.json());

// 处理A发送的订单通知
app.post('/callback', (req, res) => {
  try {
    const orderData = req.body;
    // 解析订单数据并检查订单状态是否为"DONE"
    if (orderData.state === 'done' && orderData.bizType === 'DEPOSIT') {
      // 异步处理调用A的bizflow接口，不阻塞响应
      processBizflowAPI(orderData);
      res.sendStatus(200);
    } else {
      console.log('订单状态不是"DONE"，不进行处理');
      res.sendStatus(200);
    }
  } catch (error) {
    console.error('处理订单通知时出现错误:', error);
    res.sendStatus(500);
  }
});


// AML不通过的概率
function getAMLWithProbability(p) {
    return Math.random() < p;
}

// 辅助函数：异步调用A的bizflow接口
async function callBizflowAPI(orderData) {
  const coin = orderData.coinType;
  const wallet = orderData.wallet;
  const orderId = orderData.id;
  const host = process.env.BIZFLOW_HOST || 'http://localhost:7001';
  const bizflowURL = `${host}/api/v2/s/wallet/${wallet}/orders/${orderId}/aml`;
  let params = {};
  params.appid = 'sudo';
  if(getAMLWithProbability(P)){
    //AML不通过
    params.data.passed = false;
    params.data.refundAddress = await getHotAddress(coin,wallet)
  }
  else{
    // AML通过
    params.data.passed = true;
  }
  const headers = {
    // 如果A的接口需要授权，可以在这里添加授权信息
  };

  // 发起HTTP POST请求到A的bizflow接口
  const response = await axios.post(bizflowURL, params, { headers });
  return response;
}

async function getHotAddress(token,wallet) {
    const host = process.env.BIZFLOW_HOST || 'http://localhost:7001';
    const URL = `${host}/api/v2/s/wallet/${wallet}/tokens/${token}/address?appid=sudo`;
    const response = await axios.post(bizflowURL, params, { headers });
    return response.result.hot[0]
}

// 辅助函数：异步调用A的bizflow接口，带有重试机制
async function callBizflowAPIWithRetry(orderData, maxRetries = 3, retryDelay = 10000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await callBizflowAPI(orderData);
      console.log('调用bizflow接口成功:', response.data);
      return; // 成功调用，退出重试循环
    } catch (error) {
      console.error('调用bizflow接口失败:', error);
      if (i < maxRetries - 1) {
        console.log(`将在 ${retryDelay} 毫秒后进行第 ${i + 2} 次重试...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }
  console.error('重试次数已达上限，无法调用bizflow接口');
  // 在这里可以添加其他处理逻辑，比如记录失败日志等
}

// 异步处理调用A的bizflow接口
async function processBizflowAPI(orderData) {
  await callBizflowAPIWithRetry(orderData);
}

// 启动监听服务
app.listen(port, () => {
  console.log(`监听服务已启动，正在监听端口 ${port}`);
});