'use strict';

// Fixture data is copied into the worker. Each run has a new global scope and time budget.
const CodingExercises = (() => {
  const specs = {
    lru: {
      name: 'lru',
      args: 'cap',
      kind: 'lru',
      hint: '返回包含 get(key)、set(key, value) 的对象，未命中返回 undefined。容量须为正整数，否则抛 RangeError。用例会连续调用同一实例。',
      cases: [
        [
          '读取刷新淘汰顺序',
          [
            2,
            [
              ['set', 'A', 1],
              ['set', 'B', 2],
              ['get', 'A'],
              ['set', 'C', 3],
              ['get', 'B'],
              ['get', 'C'],
            ],
          ],
          [{value: 1}, {missing: true}, {value: 3}],
        ],
        [
          '零值、布尔值与覆盖',
          [
            2,
            [
              ['set', 'A', 0],
              ['set', 'B', false],
              ['get', 'A'],
              ['get', 'B'],
              ['set', 'A', 9],
              ['set', 'C', 3],
              ['get', 'B'],
              ['get', 'A'],
            ],
          ],
          [{value: 0}, {value: false}, {missing: true}, {value: 9}],
        ],
        [
          '容量为一',
          [
            1,
            [
              ['set', 'A', 1],
              ['set', 'A', 2],
              ['get', 'A'],
              ['set', 'B', 3],
              ['get', 'A'],
            ],
          ],
          [{value: 2}, {missing: true}],
        ],
        ['拒绝零容量', [0, []], null, 'RangeError'],
        ['拒绝非整数容量', [1.5, []], null, 'RangeError'],
      ],
    },
    tree: {
      name: 'moveCheck',
      args: 'id, target, nodes',
      kind: 'tree',
      hint: 'nodes 是 Map<ID, {parentId}>，根的 parentId 为 null。沿目标祖先链遇到源或已有环返回 invalid，缺失节点返回 unknown，走到根返回 valid。这里只判断结构，源目录存在且权限由调用方另行校验。',
      cases: [
        [
          '不能移入自己的后代',
          [
            'A',
            'C',
            [
              ['A', {parentId: null}],
              ['B', {parentId: 'A'}],
              ['C', {parentId: 'B'}],
            ],
          ],
          'invalid',
        ],
        [
          '移入其他分支',
          [
            'B',
            'D',
            [
              ['A', {parentId: null}],
              ['B', {parentId: 'A'}],
              ['D', {parentId: 'A'}],
            ],
          ],
          'valid',
        ],
        ['自身与缺失节点的判断顺序', ['A', 'A', []], 'invalid'],
        ['祖先未加载', ['A', 'T', [['T', {parentId: 'missing'}]]], 'unknown'],
        [
          '零也是有效 ID',
          [
            0,
            2,
            [
              [0, {parentId: null}],
              [2, {parentId: 0}],
            ],
          ],
          'invalid',
        ],
        [
          '历史环需要终止',
          [
            'A',
            'X',
            [
              ['X', {parentId: 'Y'}],
              ['Y', {parentId: 'X'}],
            ],
          ],
          'invalid',
        ],
        ['移动到根', ['A', null, []], 'valid'],
      ],
    },
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
      const {code, name, cases, kind} = event.data;
      try {
        const solution = new Function('"use strict";\n' + code + '\nreturn ' + name + ';')();
        if (typeof solution !== 'function') throw TypeError('请保留题目给定的函数名');
        const rows = [];
        for (const [label, args, expected, expectedError] of cases) {
          try {
            let actual;
            if (kind === 'lru') {
              const cache = solution(args[0]);
              actual = [];
              for (const [method, key, value] of args[1]) {
                if (method === 'set') cache.set(key, value);
                else {
                  const result = cache.get(key);
                  actual.push(result === undefined ? {missing: true} : {value: result});
                }
              }
            } else if (kind === 'tree') {
              actual = await solution(args[0], args[1], new Map(args[2]));
            } else actual = await solution(...args);
            const received = JSON.stringify(actual) ?? String(actual);
            const want = JSON.stringify(expected);
            rows.push({
              label,
              pass: !expectedError && received === want,
              detail: expectedError
                ? '期望抛出 ' + expectedError + '，实际正常返回'
                : '期望 ' + want + '，实际 ' + received.slice(0, 160),
            });
          } catch (e) {
            rows.push({
              label,
              pass: !!expectedError && e?.name === expectedError,
              detail: String(e?.name || 'Error') + ': ' + String(e?.message || e).slice(0, 180),
            });
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
      worker.postMessage({
        code: source,
        name: specs[card].name,
        cases: specs[card].cases,
        kind: specs[card].kind,
      });
    } catch (e) {
      finish({error: e.message});
    }
  }
  return {specs, run};
})();
