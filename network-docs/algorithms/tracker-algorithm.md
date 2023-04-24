# Tracker algorithm

For each stream a topology graph is generated and maintained by a tracker.
The graph aims to be a random _k_-regular graph, where `k` is the desired number
of edges / connections each node should maintain to other nodes (its
_neighbors_).

During its operation, a tracker will keep track of all the nodes involved in the
stream and maintain neighbor lists for each node. Given node `n`, let `L(n)` be
the set of its neighbors, and let `#L(n)` be the count of its neighbors.
Neighbor lists are commutative, i.e., `n ∈ L(n')` iff `n' ∈ L(n)`.

The tracker is informed each time a node `n` joins or leaves the stream, or
when a node `n` notices that its list of neighbors has changed (e.g. a neighbor
node has disconnected). Upon receiving this information from a node, the
tracker will update its node set and neighbor lists accordingly. If a node
joins for example, it will be added to the node set and its neighbor list set
to `L(n) = ∅`. If a node leaves, we remove it from the node set and remove it
from all neighbor lists. If a node is merely informing the tracker about a
change in its neighbors, we update its neighbor lists and the neighbor lists
of its neighbors (to the extent that it involves the node).

After these updates have been applied, the topology graph is maintained using
the following algorithm.

```
1 function updateGraph(n)
2   # Remove any excess neighbors from node n
3   if #L(n) - k > 0
4       remove #L(n) - k random neighbors from L(n).
5
6   # Fill in any empty neighbor slots by finding other nodes with empty neighbor slots
7   if k - #L(n) > 0
8       candidates := all nodes n' where #L(n') < k, n ∉ L(n'), and n' ≠ n.
9       select up to k - #L(n) random nodes from candidates and make each a neighbor of n.
10
11  # Fill in empty neighbor slots by disconnecting existing connections
12  while k - #L(n) > 1
13      pairs := all pairs of neighbors (n', n'') where n' ≠ n, n'' ≠ n, n ∉ L(n'), and n ∉ L(n'').
14      (n', n'') := pop a random pair of nodes from pairs.
15      disconnect n' and n'' (so they are no longer neighbors).
16      make n a neighbor of n' and n''
17
18  send new instructions to all nodes whose neighbor list changed.
```

The algorithm takes as input the last node `n` that either joined or had a
change in its neighbor list. We start off by checking that node `n` does not
have more than `k` neighbors. If such is the case, we remove any excess
neighbors by random.

Lines 6 to 9 connect node `n` to any other nodes `n'` that have open slots and
that are not yet neighbors of node `n`. If node `n` already has `k`
neighbors this step is skipped. After connecting two nodes they both become
neighbors of each other in their respective neighbor lists, i.e., `n' ∈ L(n)`
and `n ∈ L(n')`.

Notice that there may not be enough candidate nodes available to fill up all
of the empty neighbor slots of node `n` (of which there are a total of
`k - #L(n)` at any given point in time). This is where the next, slightly
more involved procedure comes into play.

What we essentially do on Lines 11 to 16 is find pairs of nodes `(n', n'')`
that are currently neighbors of each other (i.e. `n' ∈ L(n'')` and
`n'' ∈ L(n')`) but neither of which is a neighbor of node `n`. We then
disconnect `n'` and `n''` from each other to make room for node `n`. This
results in a net total of `-1 + 2 = 1` new connections, and requires two
empty neighbor slots to be available on node `n`.

At the end of the algorithm, on line 18, the graph topology is up-to-date.
Instructions for forming new connections (and disconnecting old ones) are
sent to those nodes who had their neighbor list changed.

As a side note, it is not always possible for each node to have exactly `k`
neighbors, as this depends on divisibility between `k` and the total number of
nodes. With that being said, the algorithm does aim to max out neighbor slots
in a best-effort manner.
