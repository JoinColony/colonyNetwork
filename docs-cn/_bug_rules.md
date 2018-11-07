---
title: Bug赏金计划
section: Bug Bounty Program
order: 0
---

Colony Network是一组智能合约，旨在以安全和可预测的方式管理多人的共享资源。这些数字资产可能具有重要价值；因此，系统必须像Bilbo之前的Bagginses那样行事：没有任何意想不到的事情。

为此，Colony向外部开发人员提供实质性奖励，用于报告 colonyNetwork 合约中的缺陷和漏洞（[适用条款](https://docs.colony.io/colonynetwork/bug-bounty-program-terms-and-conditions)。

这个赏金*不*适用于像 Purser 这样的 Colony 工具。有关详细信息，请参阅[不合格的错误](https://docs.colony.io/colonynetwork/bug-bounty-program-overview/#ineligible-bugs)。

==TOC==

## 范围

该bug赏金计划扩展到[colonyNetwork Github repo](https://github.com/JoinColony/colonyNetwork)内的所有合约。

潜在错误的奖励包括但不限于：
* 声誉挖矿的漏洞
* 任务、领域及技能工作流程的漏洞
* 网络升级期间的攻击
* 授权和权限

更一般地说，如果缺陷存在于某个库（repository）并影响 Colony 智能合约，那么这也会收到奖励。

_colonyNetwork 库的某些组件不是由 Colony 团队创建的，但仍可能与整体安全性相关。如果错误或漏洞使用任何外部库或子模块，则将根据具体情况考虑其优先级._

## 规则

### 提交指南

报告的所有错误必须通过在colonyNetwork github repo中[创建问题](https://github.com/JoinColony/colonyNetwork/issues/new) 来完成，如果提交者希望私下披露，可以发送邮件至 security@colony.io 的保持匿名。私人提交的作品仍有资格获得赏金。

除非有私人披露的具体原因，否则应将bug作为问题提交到colonyNetwork GitHub存储库，并使用“bug”标签进行标记。

要求所有提交都遵循[问题模板](https://github.com/JoinColony/colonyNetwork/blob/develop/docs/ISSUE_TEMPLATE.md) 中定义的格式 - 清晰的描述和文档的完整性将是除了影响和可能性之外，还要考虑奖励金额。

在私人错误披露的情况下，所有相关材料都应该通过电子邮件发送到 `security@colony.io`  - 并且应该遵循与公共问题相同的模板。

提交后，将根据我们服务级别协议上定义的时间表对问题进行回复，验证，接受和奖励。


### 提交分支

该计划的参与者可以在colonyNetwork代码库中的两个不同分支上自由提交错误：
* 当前的testnet版本（在 `master` 分支上标记）并部署到Rinkeby
* 提交到 `develop` 分支，我们在这个分支上合并正在进行的工作

Rinkeby部署将每隔一个月更新为 _greenfield_ 部署。

### 缺陷严重性与赏金

与[以太坊Bug Bounty计划](https://bounty.ethereum.org/) 相同，Colony团队将根据[OWASP风险评级方法](https://www.owasp.org/index.php/OWASP_Risk_Rating_Methodology) 对提交的内容进行评估，基于 _Impact_ 和 _Likelihood_ 进行分级。

Colony 可自行决定是否有资格获得赏金，并确定问题的严重程度

严重程度：

* *注释级别*：最高 $ 500 USD（最低100美元）
* *低级别*：最高 $ 2,000 USD（最低500美元）
* *中级别*：最高 $ 5,000 USD（最低2,000美元）
* *高级别*：高达 $ 10,000 USD（最低5,000美元）
* *严重级别*：最高 $ 20,000 USD（最低10,000美元）

### 不合格的缺陷

Colony创建的其他软件工具中的任何漏洞或缺陷（例如colonyJS，purser，tailor等）都不符合条件。这些软件工具中的缺陷披露也是受欢迎的，但不会获得这个bug赏金计划的奖励。

不合格的错误的其他示例：
* 攻击和漏洞依赖于受损密钥或colonyNetwork代码库之外的其他安全漏洞（键盘记录程序，拦截通信，社交工程漏洞利用等）。
* 系统设计中考虑的攻击，即以太网网络垃圾邮件，恶意信誉挖矿，colony管理中的渎职行为。
* 对殖民地议定书和整体机制设计的批评。我们欢迎建议和建设性的批评，并要求将其发送至 hello@colony.io 或[Build with Colony Forums](https://build.colony.io/)

请阅读[条款和条件]（./_ bug_terms.md）以获取更多信息。
