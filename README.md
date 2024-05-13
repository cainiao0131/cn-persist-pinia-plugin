# cn-persist-pinia-plugin

#### 介绍

pinia 插件，用于 state 持久化，与 pinia-plugin-persistedstate 相比，有以下优点：

持久化粒度更细
例如当某个 state 是 Record 类型是，每次 Record.set(...) 时，只持久化对应的 Entry
而不是持久化整个 Record，更不会持久化整个 state 对象
且允许在细粒度上配置序列化与反序列化，例如对 Entry 的序列化

允许细粒度动态终止持久化
当用户自定义的序列化器返回 null 时，不会持久化本次变化
这让用户可以根据业务需求来阻止没有必要的持久化
例如通过一些高性能的比较判断，发现本次新老对象中需要持久化的内容并没有变化，则可以不用触发持久化
特别是类似富文本或流程图之类的内容，可能位置信息变化或某些元数据变化，或内容格式变化，并不需要持久化

允许为持久化配置整体防抖
本质是在用户操作的粒度上防抖
降低持久化的频率，减少 I/O 操作，提高性能

初始值相关处理
如果 state 有初始值，会持久化这些初始值
如果有初始值的 state 已经有持久化数据，则会根据已持久化的值恢复并覆盖初始值

#### 注意

当使用 setup 风格配置 pinia 时，需要通过返回的对象来调用 Action，才能触发 Action 监听器
如下通过 store.hsetAndPersistKeyNodeMap(key, node\_); 调用 hsetAndPersistKeyNodeMap() 方法
如果不通过 store 直接调用 hsetAndPersistKeyNodeMap() 不会触发 Action 监听器
因为监听器是被织入到返回的对象上的

```typescript
import { defineStore } from 'pinia';

export const STORE_KEY_NODE_TREE_CACHE = 'node-tree-cache';
// ...

export const useNodeTreeCacheStore = defineStore(
  STORE_KEY_NODE_TREE_CACHE,
  () => {
    // ...

    const hsetAndPersistKeyNodeMap = (key: string, node: DataNode) => {
      keyNodeMap.value[key] = node;
    };

    // children 改变时统一调用这个方法，以便垃圾回收
    const changeChildren = (key: string, newChildren: Array<DataNode>) => {
      // ...
      store.hsetAndPersistKeyNodeMap(key, node_);
    };
    // ...

    const store = {
      changeChildren,
      hsetAndPersistKeyNodeMap,
      // ...
    };

    return store;
  },
  {
    cnPersist: {
      states: {
        // ...
      },
    },
  },
);

export type NodeTreeStore = ReturnType<typeof useNodeTreeCacheStore>;
```

#### 软件架构

软件架构说明

为了减少对用户代码的侵入性，组件会尽最大努力基于 mutation 来实现持久化
但对于对象类型的 state，在运行时设置初始时没有的字段，无法触发响应式系统，从而不会触发 mutation
因此对于这种情况，如果用户仍然需要细粒度的持久化，则需要用户为其设置特定前缀的 Action
并且在设置字段值时，都统一调用这个 Action
这对于 Record 这类字段通常不固定的类型的 state 来说是必要的
但如果 state 为确定字段的类型，且字段在初始时就已经定义了，例如 const type User = { id: number; name: string; }
则不需要为其定义 Action 也能享受细粒度持久化

#### 安装教程

1.  xxxx
2.  xxxx
3.  xxxx

#### 使用说明

1.  xxxx
2.  xxxx
3.  xxxx

#### 参与贡献

1.  Fork 本仓库
2.  新建 Feat_xxx 分支
3.  提交代码
4.  新建 Pull Request

#### 特技

1.  使用 Readme_XXX.md 来支持不同的语言，例如 Readme_en.md, Readme_zh.md
2.  Gitee 官方博客 [blog.gitee.com](https://blog.gitee.com)
3.  你可以 [https://gitee.com/explore](https://gitee.com/explore) 这个地址来了解 Gitee 上的优秀开源项目
4.  [GVP](https://gitee.com/gvp) 全称是 Gitee 最有价值开源项目，是综合评定出的优秀开源项目
5.  Gitee 官方提供的使用手册 [https://gitee.com/help](https://gitee.com/help)
6.  Gitee 封面人物是一档用来展示 Gitee 会员风采的栏目 [https://gitee.com/gitee-stars/](https://gitee.com/gitee-stars/)
