'use strict';

// Fixture data is copied into the worker. Each run has a new global scope and time budget.
const CodingExercises = (() => {
  const specs = {
    window: {
      name: 'longestUnique',
      args: 'text',
      cases: [
        ['空输入', [''], 0],
        ['窗口不能倒退', ['abba'], 2],
        ['补充平面字符', ['😀x😀'], 2],
      ],
    },
    binary: {
      name: 'lowerBound',
      args: 'values, target',
      cases: [
        ['重复值取最左', [[1, 2, 2, 4], 2], 1],
        ['空数组', [[], 8], 0],
        ['越过末尾', [[1, 2], 3], 2],
      ],
    },
    interval: {
      name: 'mergeIntervals',
      args: 'ranges',
      cases: [
        [
          '包含与分离',
          [
            [
              [2, 3],
              [1, 10],
              [12, 14],
            ],
          ],
          [
            [1, 10],
            [12, 14],
          ],
        ],
        [
          '闭区间相接',
          [
            [
              [1, 2],
              [2, 4],
            ],
          ],
          [[1, 4]],
        ],
        ['空集合', [[]], []],
      ],
    },
    bfs: {
      name: 'levelIds',
      args: 'root',
      cases: [
        ['空树', [null], []],
        ['单根', [{id: 7}], [[7]]],
        ['逐层输出', [{id: 1, children: [{id: 2, children: [{id: 4}]}, {id: 3}]}], [[1], [2, 3], [4]]],
      ],
    },
    dp: {
      name: 'minCoins',
      args: 'coins, amount',
      cases: [
        ['贪心反例', [[1, 3, 4], 6], 2],
        ['不可达', [[2], 3], -1],
        ['金额为零', [[2, 3], 0], 0],
      ],
    },
  };
  function workerMain() {
    self.onmessage = async function (event) {
      const {code, name, cases} = event.data;
      try {
        const solution = new Function('"use strict";\n' + code + '\nreturn ' + name + ';')();
        if (typeof solution !== 'function') throw TypeError('请保留题目给定的函数名');
        const rows = [];
        for (const [label, args, expected] of cases) {
          try {
            const actual = await solution(...args);
            const received = JSON.stringify(actual) ?? String(actual);
            const want = JSON.stringify(expected);
            rows.push({
              label,
              pass: received === want,
              detail: '期望 ' + want + '，实际 ' + received.slice(0, 160),
            });
          } catch (e) {
            rows.push({label, pass: false, detail: String(e.message || e).slice(0, 180)});
          }
        }
        self.postMessage({rows});
      } catch (e) {
        self.postMessage({error: String(e.message || e).slice(0, 200)});
      }
    };
  }
  function run(card, source, report) {
    let worker, timer;
    const url = URL.createObjectURL(
      new Blob(['(' + workerMain.toString() + ')();'], {type: 'text/javascript'}),
    );
    const finish = (result) => {
      clearTimeout(timer);
      worker?.terminate();
      URL.revokeObjectURL(url);
      report(result);
    };
    try {
      worker = new Worker(url);
      timer = setTimeout(() => finish({error: '运行超过 3 秒，已停止。检查循环终止条件。'}), 3000);
      worker.onmessage = (e) => finish(e.data);
      worker.onerror = (e) => finish({error: e.message || '执行失败'});
      worker.postMessage({code: source, name: specs[card].name, cases: specs[card].cases});
    } catch (e) {
      finish({error: e.message});
    }
  }
  return {specs, run};
})();
