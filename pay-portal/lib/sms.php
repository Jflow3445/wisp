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

function sms_normalize_e164(string $raw): string {
  $canon = normalize_msisdn($raw);
  if ($canon === '') return '';
  if (preg_match('/^233\d{9}$/', $canon)) return $canon;
  if (preg_match('/^0\d{9}$/', $canon)) return '233' . substr($canon, 1);
  if (preg_match('/^\d{9}$/', $canon)) return '233' . $canon;
  return $canon;
}

function sms_provider_from_base(string $base): string {
  $b = strtolower($base);
  return (strpos($b, 'pilosms') !== false) ? 'pilosms' : 'mnotify';
}

function sms_send(string $msisdn, string $message, ?string $senderOverride=null): bool {
  $apiKey = trim((string)(sms_setting('MNOTIFY_API_KEY', '') ?? ''));
  $sender = trim((string)($senderOverride ?? sms_setting('MNOTIFY_SENDER', '') ?? ''));
  $base = trim((string)(sms_setting('MNOTIFY_BASE', '') ?? ''));
  if ($apiKey === '' || $sender === '' || $message === '') return false;
  if ($base === '') $base = 'https://api.pilosms.com/v1';
  $base = rtrim($base, '/');
  $provider = sms_provider_from_base($base);
  if ($provider === 'pilosms') $base = preg_replace('~/send-message$~i', '', $base) ?? $base;
  if ($provider !== 'pilosms') $base = preg_replace('~/sms/quick$~i', '', $base) ?? $base;

  if ($provider === 'pilosms') {
    $to = sms_normalize_e164($msisdn);
    if ($to === '') return false;
    $url = $base . '/send-message?apikey=' . rawurlencode($apiKey);
    $payload = [
      'sender' => $sender,
      'message' => $message,
      'receipients' => $to,
    ];

    if (function_exists('curl_init')) {
      $ch = curl_init($url);
      curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
      curl_setopt($ch, CURLOPT_POST, true);
      curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
      curl_setopt($ch, CURLOPT_TIMEOUT, 8);
      $resp = curl_exec($ch);
      $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
      curl_close($ch);
      if (!is_string($resp) || $resp === '') return false;
      $j = json_decode($resp, true);
      if ($code < 200 || $code >= 300) return false;
      if (is_array($j) && isset($j['status']) && (int)$j['status'] !== 1001) return false;
      return true;
    }

    $opts = [
      'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
        'content' => http_build_query($payload),
        'timeout' => 8,
      ],
    ];
    $resp = @file_get_contents($url, false, stream_context_create($opts));
    if ($resp === false || $resp === '') return false;
    $j = json_decode((string)$resp, true);
    if (is_array($j) && isset($j['status']) && (int)$j['status'] !== 1001) return false;
    return true;
  }

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
    curl_setopt($ch, CURLOPT_TIMEOUT, 8);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return is_string($resp) && $resp !== '' && $code >= 200 && $code < 300;
  }

  $opts = [
    'http' => [
      'method' => 'POST',
      'header' => "Content-Type: application/json\r\n",
      'content' => json_encode($payload),
      'timeout' => 8,
    ],
  ];
  return @file_get_contents($url, false, stream_context_create($opts)) !== false;
}
