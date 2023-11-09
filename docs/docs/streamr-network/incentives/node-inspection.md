---
sidebar_position: 4
---

# Node inspection
## Flagging
Flagging is the umbrella term used for the node inspection layer on the Streamr Network. Node inspections by flag-voting provide a degree of economic protection for sponsors when they pay for nodes to relay traffic on their selected stream inside the decentralized network.

## Flag stake
The flag stake is the amount that operators must put at risk to flag another operator for potential protocol violations. In this case, operators are required to place 500 DATA at stake to initiate a flag against another operator if they suspect a violation. It's important to note that if the flag is ultimately deemed invalid, the operator who initiated the flag will lose the flag stake. Automated spot checks conducted by the node software flag potential violations independently, ensuring protocol integrity.

The flag stake has been set to **500 DATA** and is subject to change by Streamr DAO governance vote.

## Flag reviewer reward
Each reviewer who participates in the flag review process and votes for the majority result is paid a reward of 20 DATA. This reward serves as an incentive for nodes to actively engage in the validation of flagged operators within the protocol.

The flag reviewer reward has been set to **20 DATA** and is subject to change by Streamr DAO governance vote.

## Flagger reward
If the flag raised by an operator is deemed valid, the flagger is rewarded with 360 DATA. This reward serves as an incentive for operators to flag potential protocol violations accurately, contributing to the overall integrity and adherence to protocol rules.

The flagger reward has been set to **360 DATA** and is subject to change by Streamr DAO governance vote.

## Flag reviewer count
The number of operators that are randomly selected to review a flag by inspecting and validating the work of the flagged operator, and then voting whether the flag was valid or not. The voting is stake-weighted.

The flag review count has been set to **7** and is subject to change by Streamr DAO governance vote.

## Review period
The duration of time that must pass between the act of flagging and the commencement of the voting process. The node software autonomously carries out reviews and votes on flags if it is selected as a reviewer, eliminating the need for human involvement during the review and voting phases.

The review period has been set to **1 hour** and is subject to change by Streamr DAO governance vote.

## Voting period
The duration of time allocated for reviewers to cast their votes following the review period. Similar to the review period, the voting process is entirely automated by the node software. Therefore, there is no requirement for human intervention within the specified voting period.

The voting period has been set to **15 minutes** and is subject to change by Streamr DAO governance vote.

## Flag protection period
If an operator is flagged and the flag is deemed invalid, they can not be flagged again for a short period. Operators are not allowed to fully unstake during an active flag. Therefore, without this protection period, an attacker could prevent an operator from ever unstaking by continuously flagging them. This protection period gives the operator a window of time during which they can unstake if they wish.

The flag protection period has been set to **1 hour** and is subject to change by Streamr DAO governance vote.