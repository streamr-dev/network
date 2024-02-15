/*
 * Given:
 * - two sponsorships
 * - one valid operator who mines the sponsorship1 by running one node
 * - one invalid operator who claims to mine the sponsorship1, but has no nodes running
 * - one voter: a node who mines sponsorship2
 * 
 * When:
 * - the valid operator inspects the invalid operator
 *   - it finds out that the invalid operator is not running a node
 *   - it flags the invalid operator
 * - voter see the flag
 *   - it inspects the invalid operator and sees that it is not running a node
 *   - it votes that the invalid node should be kicked out
 * 
 * Then:
 * - the invalid operator is kicked out, i.e. removed from the sponorship
 * - the invalid operator is slashed? (i.e. 10% part of his stakes is reduced)
 * - the voter and the flagger get rewards
 *   - the total reward is the amount of the slash
 *   - how it is divided between voter and the flagger
 * - the invalid operator gets earnings for the time period when it was not yet found to invalid
 * - the valid operator gets earning for the whole time period
 * 
 * ALSO test if someone raises a flag that is not valid, i.e. the flagged node does the work correctly
 * ALSO test the happy path (everyone do their work -> no flags)
 * ALSO test where invalid operator does part of the work (does work only for some partitions but not all)
 */
