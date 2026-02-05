<?php
declare(strict_types=1);
require_once __DIR__.'/settings.php';
require_once __DIR__.'/common.php';

function sms_setting(string $k, ?string $default=null): ?string {
  if (function_exists('settings_get')) {
    return settings_get($k, $default);
  }
  return $default;
}

function sms_template(string $tpl, array $vars): string {
  foreach ($vars as $k=>$v) {
    $tpl = str_replace('{'.$k.'}', (string)$v, $tpl);
  }
  return $tpl;
}

function sms_normalize_local(string $raw): string {
  $canon = normalize_msisdn($raw);
  if ($canon === '') return '';
  return msisdn_local($canon);
}

function sms_send(string $msisdn, string $message, ?string $senderOverride=null): bool {
  $apiKey = trim((string)(sms_setting('MNOTIFY_API_KEY', '') ?? ''));
  $sender = trim((string)($senderOverride ?? sms_setting('MNOTIFY_SENDER', '') ?? ''));
  $base = trim((string)(sms_setting('MNOTIFY_BASE', '') ?? ''));
  if ($apiKey === '' || $sender === '' || $message === '') return false;
  if ($base === '') $base = 'https://api.mnotify.com/api';
  $base = rtrim($base, '/');
  $to = sms_normalize_local($msisdn);
  if ($to === '') return false;

  $payload = [
    'recipient' => [$to],
    'sender' => $sender,
    'message' => $message,
    'is_schedule' => false,
    'schedule_date' => '',
  ];
  $url = $base . '/sms/quick?key=' . rawurlencode($apiKey);

  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_exec($ch);
    curl_close($ch);
    return true;
  }

  $opts = [
    'http' => [
      'method' => 'POST',
      'header' => "Content-Type: application/json\r\n",
      'content' => json_encode($payload),
      'timeout' => 5,
    ],
  ];
  @file_get_contents($url, false, stream_context_create($opts));
  return true;
}

