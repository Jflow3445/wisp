# capacityUp/capacityDown are site references supplied by the installer.
# The account's max-limit remains its plan. Reserve aggregate burst increments
# from 80% of reference capacity, rotating allocation every five minutes.
# The five-second scheduler owns this bounded probe; the VPS sync only observes
# its native last-started time. Event globals are not shared with SSH sessions.
# This avoids nested scheduler/script jobs and averaging resets.
:do {
    :local burstFactor 3;
    :local rateNumber do={
        :local s [:tostr $1]; :local multiplier 1;
        :local suffix [:pick $s ([:len $s] - 1) [:len $s]];
        :if ($suffix = "M") do={ :set multiplier 1000000; };
        :if (($suffix = "k") || ($suffix = "K")) do={ :set multiplier 1000; };
        :if ($suffix = "G") do={ :set multiplier 1000000000; };
        :if ($multiplier > 1) do={ :set s [:pick $s 0 ([:len $s] - 1)]; };
        :local n [:tonum $s]; :if ([:typeof $n] != "num") do={ :error "invalid account rate"; };
        :return ($n * $multiplier);
    };

    # Once shared congestion management is installed, its current budget is the
    # burst reference. A static peak estimate must not overrule congestion cuts.
    :local site [/queue simple find where name="nister-site" and disabled=no];
    :if ([:len $site] = 1) do={
        :local budget [:tostr [/queue simple get $site max-limit]];
        :local cut [:find $budget "/"];
        # RouterOS may return these rates with k/M/G suffixes.
        :set capacityUp [$rateNumber [:pick $budget 0 $cut]];
        :set capacityDown [$rateNumber [:pick $budget ($cut + 1) [:len $budget]]];
    };
    :local wan [/interface monitor-traffic ether1 once as-value];
    :delay 1s;
    :local previous [/interface monitor-traffic ether1 once as-value];
    :local usedUp ($wan->"tx-bits-per-second");
    :local usedDown ($wan->"rx-bits-per-second");
    :if (($previous->"tx-bits-per-second") > $usedUp) do={ :set usedUp ($previous->"tx-bits-per-second"); };
    :if (($previous->"rx-bits-per-second") > $usedDown) do={ :set usedDown ($previous->"rx-bits-per-second"); };
    :local healthy ([/system resource get cpu-load] < 60);
    :foreach core in=[/system resource cpu find] do={
        :local load [:tostr [/system resource cpu get $core load]];
        :if ([:pick $load ([:len $load] - 1) [:len $load]] = "%") do={ :set load [:pick $load 0 ([:len $load] - 1)]; };
        :if ([:tonum $load] >= 85) do={ :set healthy false; };
    };
    :if ([:len $site] = 1) do={
        :local heartbeat [/system script find where name="nister-congestion-heartbeat"];
        :if ([:len $heartbeat] != 1) do={ :set healthy false; } else={
            :local stamp [/system script get $heartbeat last-started];
            :if ([:len $stamp] = 0) do={ :set healthy false; } else={
                :local today [:tostr [/system clock get date]];
                :if ([:pick $stamp 0 10] != $today) do={ :set healthy false; } else={
                    :local age ([:totime [/system clock get time]] - [:totime [:pick $stamp 11 19]]);
                    :if (($age < 0s) || ($age > 2m)) do={ :set healthy false; };
                };
            };
        };
    };
    :local probes [/ping 1.1.1.1 count=2 interval=200ms as-value];
    :if ([:len $probes] != 2) do={ :set healthy false; };
    :foreach probe in=$probes do={
        :if ([:typeof ($probe->"time")] != "time") do={ :set healthy false; } else={
            :if (($probe->"time") > 00:00:00.050) do={ :set healthy false; };
        };
    };
    :if (($capacityUp > 0) && ($usedUp > ($capacityUp * 75 / 100))) do={ :set healthy false; };
    :if (($capacityDown > 0) && ($usedDown > ($capacityDown * 75 / 100))) do={ :set healthy false; };
    # Both traffic samples and both pings must be healthy in this invocation.
    # Do not depend on a caller's cached view of another script's globals.
    :local good 0;
    :if ($healthy) do={ :set good 2; };
    :local budgetUp ($capacityUp * 80 / 100 - $usedUp);
    :local budgetDown ($capacityDown * 80 / 100 - $usedDown);
    :local pairNumbers do={
        :local s [:tostr $1]; :local slash [:find $s "/"]; :local number $2;
        :return (([$number [:pick $s 0 $slash]]) . "/" . ([$number [:pick $s ($slash + 1) [:len $s]]]));
    };
    :local queues [/queue simple find where comment~"^NISTER ACCOUNT SHAPER"];
    :local count [:len $queues];
    :if ($count > 0) do={
        # :tonsec returns nanoseconds, so this is a five-minute rotation.
        :local offset (([:tonsec [:timestamp]] / 300000000000) % $count);
        # Allocate to accounts carrying traffic before idle connected accounts.
        :foreach demand in={true;false} do={
          :for i from=0 to=($count - 1) do={
            :local q [:pick $queues (($i + $offset) % $count)];
            :local pps [:tostr [/queue simple get $q packet-rate]];
            :local cut [:find $pps "/"];
            :local active (([:tonum [:pick $pps 0 $cut]] > 5) || ([:tonum [:pick $pps ($cut + 1) [:len $pps]]] > 5));
            :if ($active = $demand) do={
            :local pair [:tostr [/queue simple get $q max-limit]];
            :local slash [:find $pair "/"];
            :local up [$rateNumber [:pick $pair 0 $slash]];
            :local down [$rateNumber [:pick $pair ($slash + 1) [:len $pair]]];
            :local peakUp 0; :local peakDown 0;
            :local extraUp ($up * ($burstFactor - 1));
            :local extraDown ($down * ($burstFactor - 1));
            :if (($good = 2) && ($up > 0) && (($up * $burstFactor) <= ($capacityUp * 80 / 100)) && ($budgetUp >= $extraUp)) do={
                :set peakUp ($up * $burstFactor); :set budgetUp ($budgetUp - $extraUp);
            };
            :if (($good = 2) && ($down > 0) && (($down * $burstFactor) <= ($capacityDown * 80 / 100)) && ($budgetDown >= $extraDown)) do={
                :set peakDown ($down * $burstFactor); :set budgetDown ($budgetDown - $extraDown);
            };
            :local burst ($peakUp . "/" . $peakDown);
            :local threshold (($up * 75 / 100) . "/" . ($down * 75 / 100));
            # Preserve RouterOS averaging history on unchanged guard ticks.
            :if ([$pairNumbers [/queue simple get $q burst-threshold] $rateNumber] != $threshold) do={ /queue simple set $q burst-threshold=$threshold; };
            :if ([:tostr [/queue simple get $q burst-time]] != "16s/16s") do={ /queue simple set $q burst-time=16s/16s; };
            :if ([$pairNumbers [/queue simple get $q burst-limit] $rateNumber] != $burst) do={ /queue simple set $q burst-limit=$burst; };
            };
          };
        };
    };
} on-error={
    /queue simple set [find where comment~"^NISTER ACCOUNT SHAPER"] burst-limit=0/0;
    :log warning "nister: QoS headroom probe failed; bursts disabled";
};
