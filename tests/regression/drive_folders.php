<?php
declare(strict_types=1);
require __DIR__.'/../../pay-portal/lib/drive_folders.php';
$checks=0;
function folder_check(string $name, bool $ok): void {
  global $checks;
  if (!$ok) throw new RuntimeException($name);
  $checks++; echo 'PASS drive_folder_'.$name.PHP_EOL;
}
$folder=['mimeType'=>'application/vnd.google-apps.folder','trashed'=>false,'capabilities'=>['canAddChildren'=>true]];
$created=[];$saved=[];
$create=static function(string $name,?string $parent) use (&$created):string { $created[]=[$name,$parent];return 'new-root'; };
$persist=static function(string $id) use (&$saved):void { $saved[]=$id; };
$okMeta=static fn(string $id):array=>$folder;
folder_check('valid_cached_id_reused',gdrive_resolve_archive_root('old-root','','archive',$okMeta,$create,$persist)==='old-root' && !$created && !$saved);
$stale=static function(string $id) use ($folder):array {if($id==='old-root')throw new RuntimeException('not found',404);return $folder;};
folder_check('stale_id_recovers_under_current_connection',gdrive_resolve_archive_root('old-root','','archive',$stale,$create,$persist)==='new-root');
folder_check('default_parent_preserved',$created===[['archive',null]] && $saved===['new-root']);
$created=[];$saved=[];
gdrive_resolve_archive_root('old-root','chosen-parent','archive',$stale,$create,$persist);
folder_check('explicit_parent_preserved',$created===[['archive','chosen-parent']]);
foreach ([401,403,429,500,0] as $code) {
  $created=[];$saved=[];
  $error=static function(string $id) use ($code):array {throw new RuntimeException('unavailable',$code);};
  try {gdrive_resolve_archive_root('old-root','','archive',$error,$create,$persist);throw new LogicException('expected_error');}
  catch(RuntimeException $e) {folder_check('error_'.$code.'_never_creates_replacement',!$created && !$saved && $e->getCode()===$code);}
}
$created=[];$saved=[];
$trashed=static function(string $id) use ($folder):array {return $id==='old-root'?array_merge($folder,['trashed'=>true]):$folder;};
folder_check('trashed_root_recovered',gdrive_resolve_archive_root('old-root','','archive',$trashed,$create,$persist)==='new-root');
foreach (['read_only'=>array_merge($folder,['capabilities'=>['canAddChildren'=>false]]),
          'wrong_type'=>['mimeType'=>'application/octet-stream','trashed'=>false]] as $reason=>$meta) {
  $created=[];$saved=[];
  $unusable=static fn(string $id):array=>$meta;
  try {gdrive_resolve_archive_root('old-root','','archive',$unusable,$create,$persist);throw new LogicException('expected_error');}
  catch(RuntimeException $e) {folder_check($reason.'_cached_root_is_not_replaced',!$created && !$saved);}
}
$created=[];$saved=[];
$missingParent=static function(string $id) use ($folder):array {if($id==='chosen-parent')throw new RuntimeException('not found',404);return $folder;};
try {gdrive_resolve_archive_root('','chosen-parent','archive',$missingParent,$create,$persist);throw new LogicException('expected_error');}
catch(RuntimeException $e) {folder_check('missing_parent_is_not_silently_replaced',!$created && !$saved);}
$created=[];$saved=[];
$file=static fn(string $id):array=>['mimeType'=>'application/octet-stream'];
try {gdrive_resolve_archive_root('','','archive',$file,$create,$persist);throw new LogicException('expected_error');}
catch(RuntimeException $e) {folder_check('nonfolder_is_not_persisted',!$saved);}
echo 'Drive folder checks passed ('.$checks.').'.PHP_EOL;
