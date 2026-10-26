:local canonical do={
    :local value [:tostr $1];
    :if (([:len $value] = 14) && ([:pick $value 0 5] = "00233")) do={ :set value ("0" . [:pick $value 5 14]); };
    :if (([:len $value] = 13) && ([:pick $value 0 4] = "2330")) do={ :set value ("0" . [:pick $value 4 13]); };
    :if (([:len $value] = 12) && ([:pick $value 0 3] = "233")) do={ :set value ("0" . [:pick $value 3 12]); };
    :if (([:len $value] != 10) || (!($value ~ "^0[0-9]+\$"))) do={ :return ""; };
    :return $value;
};
:local account [$canonical $user];
:if ([:len $account] = 0) do={ :return; };
:local targets "";
:foreach session in=[/ip hotspot active find] do={
    :local ip [:tostr [/ip hotspot active get $session address]];
    :if (([$canonical [/ip hotspot active get $session user]] = $account) && ($ip != [:tostr $address])) do={
        :if ([:len $targets] > 0) do={ :set targets ($targets . ","); };
        :set targets ($targets . $ip . "/32");
    };
};
:local queues [/queue simple find where name=("nister-acct-" . $account)];
:if ([:len $queues] > 0) do={
    :if ([:len $targets] = 0) do={
        /queue simple set $queues target=192.0.2.1/32;
    } else={
        /queue simple set $queues target=$targets;
    };
};
:if ([:len [/queue simple find where name="nister-site" and disabled=no]] = 1) do={
    /system script run nister-qos-devices;
};
