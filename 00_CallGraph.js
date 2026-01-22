/**
 * Call Graph Analysis System
 *
 * Build dynamic call graph to understand function relationships, identify
 * hot paths, circular dependencies, and deep nesting patterns.
 *
 * Features:
 * - Track function call stack (caller → callee relationships)
 * - Track edges (who calls whom, how many times)
 * - Calculate node statistics (in-degree, out-degree)
 * - Identify hub functions (call many others)
 * - Identify leaf functions (called by many, call none)
 * - Detect potential circular dependencies
 * - Calculate call depth statistics
 *
 * Target overhead: <1ms per call
 *
 * Usage:
 *   function myFunction() {
 *     cgEnter('myFunction');
 *     try {
 *       // ... work ...
 *       otherFunction();
 *       cgExit('myFunction');
 *     } catch (error) {
 *       cgExit('myFunction');
 *       throw error;
 *     }
 *   }
 *
 *   // View report
 *   cgReport();
 */

// Call graph state
let CG_ENABLED = true;
let CG_CALL_STACK = []; // Current call stack
let CG_EDGES = {}; // "caller→callee" → count
let CG_NODES = {}; // functionName → {inDegree, outDegree, calls, calledBy}
let CG_MAX_DEPTH = 0;
let CG_DEPTH_HISTOGRAM = {}; // depth → count

/**
 * Enter a function (push to call stack)
 * @param {string} functionName - Name of the function being entered
 */
function cgEnter(functionName) {
  if (!CG_ENABLED) return;

  try {
    // Get current caller
    const depth = CG_CALL_STACK.length;
    const caller = depth > 0 ? CG_CALL_STACK[depth - 1] : null;

    // Track max depth
    if (depth > CG_MAX_DEPTH) {
      CG_MAX_DEPTH = depth;
    }

    // Track depth histogram
    CG_DEPTH_HISTOGRAM[depth] = (CG_DEPTH_HISTOGRAM[depth] || 0) + 1;

    // Initialize node if new
    if (!CG_NODES[functionName]) {
      CG_NODES[functionName] = {
        functionName: functionName,
        inDegree: 0,
        outDegree: 0,
        calls: {}, // callee → count
        calledBy: {} // caller → count
      };
    }

    // Record edge if there's a caller
    if (caller) {
      const edgeKey = caller + '→' + functionName;
      CG_EDGES[edgeKey] = (CG_EDGES[edgeKey] || 0) + 1;

      // Update node relationships
      const callerNode = CG_NODES[caller];
      if (!callerNode.calls[functionName]) {
        callerNode.calls[functionName] = 0;
        callerNode.outDegree++;
      }
      callerNode.calls[functionName]++;

      const calleeNode = CG_NODES[functionName];
      if (!calleeNode.calledBy[caller]) {
        calleeNode.calledBy[caller] = 0;
        calleeNode.inDegree++;
      }
      calleeNode.calledBy[caller]++;
    }

    // Push to call stack
    CG_CALL_STACK.push(functionName);
  } catch (error) {
    // Fallback logging (UnifiedLogger may fail in error states)
    console.error('[CallGraph] cgEnter failed:', error);
  }
}

/**
 * Exit a function (pop from call stack)
 * @param {string} functionName - Name of the function being exited
 */
function cgExit(functionName) {
  if (!CG_ENABLED) return;

  try {
    if (CG_CALL_STACK.length === 0) {
      UnifiedLogger.warn('CallGraph', 'cgExit called with empty stack', { functionName: functionName });
      return;
    }

    const popped = CG_CALL_STACK.pop();
    if (popped !== functionName) {
      UnifiedLogger.warn('CallGraph', 'Stack mismatch', { expected: functionName, got: popped });
    }
  } catch (error) {
    // Fallback logging (UnifiedLogger may fail in error states)
    console.error('[CallGraph] cgExit failed:', error);
  }
}

/**
 * Generate call graph report
 * @return {string} Formatted report
 */
function cgReport() {
  try {
    if (!CG_NODES || Object.keys(CG_NODES).length === 0) {
      return '[CallGraph] No call graph data collected';
    }

    let report = '\n=== Call Graph Report ===\n';
    report += 'Total functions: ' + Object.keys(CG_NODES).length + '\n';
    report += 'Total edges: ' + Object.keys(CG_EDGES).length + '\n';
    report += 'Max call depth: ' + CG_MAX_DEPTH + '\n\n';

    // Node statistics
    const nodes = Object.keys(CG_NODES).map(function(name) { return CG_NODES[name]; });

    // Hub functions (high out-degree, call many others)
    report += '=== Hub Functions (Top 10) ===\n';
    report += 'Functions that call many other functions (refactoring candidates)\n\n';
    const hubs = nodes
      .filter(function(node) { return node.outDegree > 0; })
      .sort(function(a, b) { return b.outDegree - a.outDegree; })
      .slice(0, 10);

    if (hubs.length > 0) {
      report += 'Function'.padEnd(40) + ' | Calls | Top Callees\n';
      report += '-'.repeat(80) + '\n';
      hubs.forEach(function(node) {
        const name = node.functionName.length > 39 ? node.functionName.substring(0, 36) + '...' : node.functionName;
        report += name.padEnd(40) + ' | ' + String(node.outDegree).padStart(5) + ' | ';

        // Show top 3 most frequent callees
        const topCallees = Object.keys(node.calls)
          .map(function(callee) { return { name: callee, count: node.calls[callee] }; })
          .sort(function(a, b) { return b.count - a.count; })
          .slice(0, 3)
          .map(function(c) { return c.name + '(' + c.count + ')'; })
          .join(', ');
        report += topCallees + '\n';
      });
    } else {
      report += '(No hub functions detected)\n';
    }

    // Leaf functions (high in-degree, low/zero out-degree)
    report += '\n=== Leaf Functions (Top 10) ===\n';
    report += 'Functions called by many, but call few/none (optimization candidates)\n\n';
    const leaves = nodes
      .filter(function(node) { return node.inDegree > 0 && node.outDegree <= 2; })
      .sort(function(a, b) { return b.inDegree - a.inDegree; })
      .slice(0, 10);

    if (leaves.length > 0) {
      report += 'Function'.padEnd(40) + ' | Called By | Out\n';
      report += '-'.repeat(60) + '\n';
      leaves.forEach(function(node) {
        const name = node.functionName.length > 39 ? node.functionName.substring(0, 36) + '...' : node.functionName;
        report += name.padEnd(40) + ' | ';
        report += String(node.inDegree).padStart(9) + ' | ';
        report += String(node.outDegree).padStart(3) + '\n';
      });
    } else {
      report += '(No leaf functions detected)\n';
    }

    // Hottest edges (most frequent calls)
    report += '\n=== Hottest Call Paths (Top 15) ===\n';
    const edges = Object.keys(CG_EDGES).map(function(edge) {
      return { edge: edge, count: CG_EDGES[edge] };
    });
    edges.sort(function(a, b) { return b.count - a.count; });

    if (edges.length > 0) {
      report += 'Caller → Callee'.padEnd(80) + ' | Count\n';
      report += '-'.repeat(95) + '\n';
      edges.slice(0, 15).forEach(function(e) {
        const edgeName = e.edge.length > 79 ? e.edge.substring(0, 76) + '...' : e.edge;
        report += edgeName.padEnd(80) + ' | ' + String(e.count).padStart(5) + '\n';
      });
    }

    // Potential circular dependencies
    report += '\n=== Potential Circular Dependencies ===\n';
    const circular = detectCircularDependencies_();
    if (circular.length > 0) {
      report += 'WARNING: ' + circular.length + ' circular patterns detected\n\n';
      circular.slice(0, 10).forEach(function(cycle) {
        report += cycle.join(' → ') + ' → ' + cycle[0] + '\n';
      });
      if (circular.length > 10) {
        report += '... and ' + (circular.length - 10) + ' more\n';
      }
    } else {
      report += '(No circular dependencies detected)\n';
    }

    // Call depth histogram
    report += '\n=== Call Depth Distribution ===\n';
    const depths = Object.keys(CG_DEPTH_HISTOGRAM).map(function(d) { return parseInt(d); });
    depths.sort(function(a, b) { return a - b; });
    depths.forEach(function(depth) {
      const count = CG_DEPTH_HISTOGRAM[depth];
      const bar = '*'.repeat(Math.min(count / 10, 50));
      report += 'Depth ' + String(depth).padStart(2) + ': ' + String(count).padStart(5) + ' ' + bar + '\n';
    });

    // Insights
    report += '\n=== Insights ===\n';
    const avgInDegree = nodes.reduce(function(sum, n) { return sum + n.inDegree; }, 0) / nodes.length;
    const avgOutDegree = nodes.reduce(function(sum, n) { return sum + n.outDegree; }, 0) / nodes.length;
    report += 'Average in-degree: ' + avgInDegree.toFixed(2) + '\n';
    report += 'Average out-degree: ' + avgOutDegree.toFixed(2) + '\n';

    const isolatedFunctions = nodes.filter(function(n) { return n.inDegree === 0 && n.outDegree === 0; });
    if (isolatedFunctions.length > 0) {
      report += 'Isolated functions (never called): ' + isolatedFunctions.length + '\n';
    }

    const entryPoints = nodes.filter(function(n) { return n.inDegree === 0 && n.outDegree > 0; });
    if (entryPoints.length > 0) {
      report += 'Entry points (called by none, call others): ' + entryPoints.length + '\n';
      report += '  Examples: ' + entryPoints.slice(0, 5).map(function(n) { return n.functionName; }).join(', ') + '\n';
    }

    report += '\n======================\n';
    return report;
  } catch (error) {
    // Fallback logging (UnifiedLogger may fail in error states)
    console.error('[CallGraph] cgReport failed:', error);
    return '[CallGraph] Error generating report: ' + error.message;
  }
}

/**
 * Detect circular dependencies using DFS
 * @private
 * @return {Array} Array of circular dependency cycles
 */
function detectCircularDependencies_() {
  const cycles = [];
  const visited = {};
  const recursionStack = {};

  function dfs(node, path) {
    if (recursionStack[node]) {
      // Found a cycle - extract it from path
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        cycles.push(path.slice(cycleStart));
      }
      return;
    }

    if (visited[node]) return;

    visited[node] = true;
    recursionStack[node] = true;
    path.push(node);

    const nodeData = CG_NODES[node];
    if (nodeData && nodeData.calls) {
      Object.keys(nodeData.calls).forEach(function(callee) {
        dfs(callee, path.slice());
      });
    }

    recursionStack[node] = false;
  }

  Object.keys(CG_NODES).forEach(function(node) {
    if (!visited[node]) {
      dfs(node, []);
    }
  });

  // Deduplicate cycles
  const uniqueCycles = [];
  const cycleSignatures = {};
  cycles.forEach(function(cycle) {
    const signature = cycle.sort().join('→');
    if (!cycleSignatures[signature]) {
      cycleSignatures[signature] = true;
      uniqueCycles.push(cycle);
    }
  });

  return uniqueCycles;
}

/**
 * Log call graph report to console
 */
function cgLogReport() {
  UnifiedLogger.info('CallGraph', 'Call graph report', { report: cgReport() });
}

/**
 * Get raw call graph data
 * @return {Object} Object with nodes, edges, and metadata
 */
function cgGetData() {
  return {
    nodes: CG_NODES,
    edges: CG_EDGES,
    maxDepth: CG_MAX_DEPTH,
    depthHistogram: CG_DEPTH_HISTOGRAM
  };
}

/**
 * Get node data for a specific function
 * @param {string} functionName - Function name
 * @return {Object|null} Node data or null
 */
function cgGetNode(functionName) {
  return CG_NODES[functionName] || null;
}

/**
 * Reset call graph (clear all data)
 */
function cgReset() {
  CG_CALL_STACK = [];
  CG_EDGES = {};
  CG_NODES = {};
  CG_MAX_DEPTH = 0;
  CG_DEPTH_HISTOGRAM = {};
}

/**
 * Enable call graph tracking
 */
function cgEnable() {
  CG_ENABLED = true;
}

/**
 * Disable call graph tracking
 */
function cgDisable() {
  CG_ENABLED = false;
}

/**
 * Check if call graph tracking is enabled
 * @return {boolean}
 */
function cgIsEnabled() {
  return CG_ENABLED;
}

/**
 * Get current call stack
 * @return {Array} Current call stack
 */
function cgGetStack() {
  return CG_CALL_STACK.slice(); // Return copy
}

// Export globally
