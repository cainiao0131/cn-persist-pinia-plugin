不侵入用户代码，用户无感知的持久化，只能在 store 粒度上进行，也就是每次都要持久化某个 store 的所有 state
要想更细粒度的持久化，例如基于某一个 state 的变化，或基于某个 state 的某个字段进行持久化
需要用户编写特定名称的 Action，且保证所有需要持久化的修改都通过调用定义的特定 Action 来完成

之所以有这个限制，是因为受限于 Vue 的机制：
无论是对 state 的直接修改，还是对 state 的成员的修改  
当多个修改在同一个 Tick（Vue 中的概念）完成时，只会触发一次 mutation  
pinia 的 mutation 与 Vue 的 watch 行为一致，因此用 watch 也存在同样的问题
并且，在 mutation 中只能拿到这个 Tick 第一次设置的新值，其它更新数据会丢失
虽然在 mutation 中可以拿到整体 state 的最新值，但每次都通过深度遍历 state 查找本次改变了的值的开销太大
