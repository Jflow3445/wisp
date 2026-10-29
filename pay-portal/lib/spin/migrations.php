<?php
declare(strict_types=1);

function spin_apply_migrations(PDO $db): void {
  $db->exec('CREATE TABLE IF NOT EXISTS spin_schema_migrations(version VARCHAR(64) PRIMARY KEY,applied_at DATETIME NOT NULL) ENGINE=InnoDB');
  $files=glob(__DIR__.'/../../migrations/*_spin_*.sql');sort($files,SORT_STRING);
  foreach($files as $file) {
    $version=basename($file);$st=$db->prepare('SELECT 1 FROM spin_schema_migrations WHERE version=?');$st->execute([$version]);
    if($st->fetchColumn()) continue;
    foreach(preg_split('/;\s*(?:\r?\n|$)/',file_get_contents($file)) as $sql) {
      if(trim($sql)==='') continue;
      // Resume safely if a previous DDL migration stopped after adding a column.
      if(preg_match('/ALTER TABLE (\w+) ADD COLUMN (\w+)/i',$sql,$m)) {
        $check=$db->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?');$check->execute([$m[1],$m[2]]);
        if($check->fetchColumn()) continue;
      }
      $db->exec($sql);
    }
    $db->prepare('INSERT INTO spin_schema_migrations(version,applied_at) VALUES(?,UTC_TIMESTAMP())')->execute([$version]);
  }
}
