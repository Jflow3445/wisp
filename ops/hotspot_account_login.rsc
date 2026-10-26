:local canonical do={
    :local value [:tostr $1];
    :if (([:len $value] = 14) && ([:pick $value 0 5] = "00233")) do={ :set value ("0" . [:pick $value 5 14]); };
    :if (([:len $value] = 13) && ([:pick $value 0 4] = "2330")) do={ :set value ("0" . [:pick $value 4 13]); };
    :if (([:len $value] = 12) && ([:pick $value 0 3] = "233")) do={ :set value ("0" . [:pick $value 3 12]); };
    :if (([:len $value] != 10) || (!($value ~ "^0[0-9]+\$"))) do={ :return ""; };
    :return $value;
};
:local accountUser [:tostr $user];
:local account [$canonical $accountUser];
:local clientIP [:tostr $address];
:if ([:len $account] = 0) do={
    :log warning "nister: rejected unsupported hotspot account identity";
    /ip hotspot active remove [find where user=$accountUser and address=$clientIP];
    :return;
};
:local devices "|";
:local deviceCount 0;
:local targets "";
:foreach session in=[/ip hotspot active find] do={
    :if ([$canonical [/ip hotspot active get $session user]] = $account) do={
        :local mac [:tostr [/ip hotspot active get $session mac-address]];
        :local token ("|" . $mac . "|");
        :if ([:typeof [:find $devices $token]] = "nil") do={
            :set devices ($devices . $mac . "|");
            :set deviceCount ($deviceCount + 1);
        };
        :local ip [:tostr [/ip hotspot active get $session address]];
        :if ([:len $targets] > 0) do={ :set targets ($targets . ","); };
        :set targets ($targets . $ip . "/32");
    };
};
:if ($deviceCount > 2) do={
    :local clientMAC $"mac-address";
    /ip hotspot cookie remove [find where user=$accountUser and mac-address=$clientMAC];
    /ip hotspot active remove [find where user=$accountUser and address=$clientIP];
    :log warning "nister: denied third hotspot device for an account";
    :return;
};
:if ([:len $targets] = 0) do={ :set targets ($clientIP . "/32"); };
:do {
    :local queueName ("nister-acct-" . $account);
    :local queues [/queue simple find where name=$queueName];
    :if ([:len $queues] > 1) do={ :error "duplicate account queue"; };
    :if ([:len $queues] = 0) do={
        /queue simple add name=$queueName target=$targets max-limit=1M/1M limit-at=0/0 burst-limit=0/0 queue=nister-fair-up/nister-fair-down comment=("NISTER ACCOUNT SHAPER user=" . $account . " rate=1M/1M pending=yes");
        :set queues [/queue simple find where name=$queueName];
    } else={
        /queue simple set $queues target=$targets disabled=no;
    };
    :local before [/queue simple find where name="nister-unclassified"];
    :if ([:len [/queue simple find where name="nister-site" and disabled=no]] = 1) do={
        /system script run nister-qos-devices;
    } else={
        :if ([:len $before] = 1) do={ /queue simple move [:pick $queues 0] [:pick $before 0]; };
    };
} on-error={
    :log error "nister: hotspot account queue admission failed";
    /ip hotspot active remove [find where user=$accountUser and address=$clientIP];
};
