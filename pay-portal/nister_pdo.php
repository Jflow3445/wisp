<?php
declare(strict_types=1);

/**
 * NISTER_PDO_DUP_PLACEHOLDER_FIX_V1
 * Fixes PDO MySQL HY093 caused by repeated named placeholders when emulate_prepares=false.
 *
 * - On prepare(): rewrites duplicates (e.g., :a used twice -> :a and :a__2)
 * - On execute(): duplicates the value into the rewritten params automatically
 * - Still logs failures with [NISTER_PDO_EXEC_FAIL]
 */

final class NisterPDOStatement extends PDOStatement {
  /** @var array<string, array<int, string>> baseName => [aliasName, ...] (no leading colons) */
  private array $nister_dup_map = [];

  protected function __construct() {}

  public function _nisterSetDupMap(array $map): void {
    $this->nister_dup_map = $map;
  }

  public function execute($params = null): bool {
    $sql = (string)($this->queryString ?? '');
    $p = $params;

    // Expand duplicate named placeholders (assoc only)
    if (is_array($p) && $this->nister_dup_map) {
      $isAssoc = array_keys($p) !== range(0, count($p) - 1);
      if ($isAssoc) {
        $norm = [];
        foreach ($p as $k => $v) {
          if (is_int($k)) { // should not happen for named binds, but keep safe
            $norm[$k] = $v;
            continue;
          }
          $bare = ltrim((string)$k, ':');
          $norm[':' . $bare] = $v;
        }

        foreach ($this->nister_dup_map as $baseBare => $aliases) {
          $baseKey = ':' . $baseBare;
          if (!array_key_exists($baseKey, $norm)) continue;
          $val = $norm[$baseKey];
          foreach ($aliases as $aliasBare) {
            $aliasKey = ':' . $aliasBare;
            if (!array_key_exists($aliasKey, $norm)) $norm[$aliasKey] = $val;
          }
        }

        $p = $norm;
      }
    }

    try {
      return parent::execute($p);
    } catch (Throwable $e) {
      $dump = '';
      if (method_exists($this, 'debugDumpParams')) {
        ob_start();
        $this->debugDumpParams();
        $dump = (string)ob_get_clean();
      }
      $oneLineSql = preg_replace('/\s+/', ' ', trim($sql));
      $jparams = json_encode($p);
      if (is_string($jparams) && strlen($jparams) > 1200) $jparams = substr($jparams, 0, 1200) . '...';
      $dump = preg_replace('/\s+/', ' ', (string)$dump);

      error_log('[NISTER_PDO_EXEC_FAIL] ' . $e->getMessage()
        . ' sql=' . $oneLineSql
        . ' params=' . ($jparams ?: 'null')
        . ' dump=' . $dump
      );
      throw $e;
    }
  }
}

final class NisterPDO extends PDO {
  public function __construct($dsn, $username = null, $passwd = null, $options = null) {
    $opts = is_array($options) ? $options : [];
    if (!isset($opts[PDO::ATTR_ERRMODE])) $opts[PDO::ATTR_ERRMODE] = PDO::ERRMODE_EXCEPTION;
    parent::__construct($dsn, (string)($username ?? ''), (string)($passwd ?? ''), $opts);
    $this->setAttribute(PDO::ATTR_STATEMENT_CLASS, [NisterPDOStatement::class, []]);
  }

  public function prepare($query, $options = []): PDOStatement|false {
    $sql = (string)$query;

    // Rewrite duplicate named placeholders: :a :a -> :a :a__2
    $seen = [];
    $dupMap = []; // base => [alias...]
    $sql2 = preg_replace_callback(
      '/:([A-Za-z_][A-Za-z0-9_]*)/',
      function(array $m) use (&$seen, &$dupMap): string {
        $name = $m[1];
        $seen[$name] = ($seen[$name] ?? 0) + 1;
        if ($seen[$name] === 1) return $m[0];
        $alias = $name . '__' . $seen[$name];
        $dupMap[$name][] = $alias;
        return ':' . $alias;
      },
      $sql
    );

    $stmt = parent::prepare($sql2, is_array($options) ? $options : []);
    if ($stmt instanceof NisterPDOStatement && $dupMap) {
      $stmt->_nisterSetDupMap($dupMap);
    }
    return $stmt;
  }
}
