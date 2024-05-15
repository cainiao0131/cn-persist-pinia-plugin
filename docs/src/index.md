---
layout: home
title: Home
hero:
  name: 'cn-persist-pinia-plugin'
  tagline: Pinia 持久化存储插件
  image:
    src: /logo.svg
    alt: Pinia 持久化存储插件
  actions:
    - theme: brand
      text: 开始使用
      link: /markdown-examples
    - theme: alt
      text: Examples
      link: /api-examples

features:
  - title: 细粒度持久化
    details: 基于单个 State 或 State 的单个 Key 持久化，避免局部状态更新导致整体数据持久化
  - title: 整体防抖
    details: 事件驱动，整体防抖，同持久化 Key 只取最后更新的值，避免频繁 I/O
  - title: 易于使用
    details: 尽可能类型安全地进行配置，如基于 TypeScript 类型的 State include、exclude 持久化字段筛选配置
---
