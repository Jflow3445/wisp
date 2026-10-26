# Account/device hierarchy with per-device FQ-CoDel. Snapshot queue properties
# once per reconciliation; per-property CLI reads across every device are costly
# on the hEX S. Only changed properties produce configuration writes.
# Login/logout hooks and both VPS workers can invoke this script together.
# A second invocation must leave the current writer to finish its snapshot.
:if ([/system script job print count-only as-value where script=[:jobname]] <= 1) do={
:local rows [/queue simple print as-value];
:local byName [:toarray ""];
:foreach row in=$rows do={ :set ($byName->($row->"name")) $row; };
:local site ($byName->"nister-site");
:if ([:typeof $site] != "array") do={ :return "no_site"; };
:if ($site->"disabled") do={ :return "disabled_site"; };
:local number do={
    :local s [:tostr $1]; :local m 1;
    :local suffix [:pick $s ([:len $s] - 1) [:len $s]];
    :if ($suffix = "M") do={ :set m 1000000; };
    :if (($suffix = "k") || ($suffix = "K")) do={ :set m 1000; };
    :if ($suffix = "G") do={ :set m 1000000000; };
    :if ($m > 1) do={ :set s [:pick $s 0 ([:len $s] - 1)]; };
    :local divisor 1; :local dot [:find $s "."];
    :if ([:typeof $dot] != "nil") do={
        :local decimals ([:len $s] - $dot - 1);
        :for i from=1 to=$decimals do={ :set divisor ($divisor * 10); };
        :set s ([:pick $s 0 $dot] . [:pick $s ($dot + 1) [:len $s]]);
    };
    :local n [:tonum $s]; :if ([:typeof $n] != "num") do={ :error "invalid queue rate"; };
    :return ($n * $m / $divisor);
};
:local pair do={
    :local s [:tostr $1];
    :if ([:typeof $1] = "array") do={ :set s (([:pick $1 0]) . "/" . ([:pick $1 1])); };
    :local cut [:find $s "/"]; :local n $2;
    :return (([$n [:pick $s 0 $cut]]) . "/" . ([$n [:pick $s ($cut + 1) [:len $s]]]));
};

:foreach leaf in=$rows do={
  :if (($leaf->"comment") = "NISTER DEVICE AQM") do={
    :local parentName ($leaf->"parent");
    :local account ($byName->$parentName);
    :local keep false;
    :if ([:typeof $account] = "array") do={
      :foreach target in=($account->"target") do={
        :if ([:tostr $target] = [:tostr ($leaf->"target")]) do={ :set keep true; };
      };
    };
    :if (!$keep) do={ /queue simple remove ($leaf->".id"); };
  };
};
:foreach account in=$rows do={
  :if (($account->"comment") ~ "^NISTER ACCOUNT SHAPER") do={
    :local q ($account->".id");
    :local parentName ($account->"name");
    :if ([:tostr ($account->"parent")] != "nister-site") do={ /queue simple set $q parent=nister-site; };
    :local targets ($account->"target");
    :local count [:len $targets];
    :local rate [$pair ($account->"max-limit") $number];
    :local cut [:find $rate "/"];
    :local up ([$number [:pick $rate 0 $cut]] * 3);
    :local down ([$number [:pick $rate ($cut + 1) [:len $rate]]] * 3);
    :local cir [$pair ($account->"limit-at") $number];
    :local split [:find $cir "/"];
    :local share (([$number [:pick $cir 0 $split]] / $count) . "/" . ([$number [:pick $cir ($split + 1) [:len $cir]]] / $count));
    :foreach target in=$targets do={
      :local ip [:pick [:tostr $target] 0 [:find [:tostr $target] "/"]];
      :if ($ip != "192.0.2.1") do={
        :local leafName ("nister-dev-" . [:pick $parentName 12 [:len $parentName]] . "-" . $ip);
        :local leaf ($byName->$leafName);
        :local peak ($up . "/" . $down);
        :if ([:typeof $leaf] != "array") do={
          /queue simple add name=$leafName target=$target parent=$parentName queue=nister-device-aqm/nister-device-aqm max-limit=$peak limit-at=$share bucket-size=0.01/0.01 comment="NISTER DEVICE AQM";
        } else={
          :local leafId ($leaf->".id");
          :if ([$pair ($leaf->"max-limit") $number] != $peak) do={ /queue simple set $leafId max-limit=$peak; };
          :if ([$pair ($leaf->"limit-at") $number] != $share) do={ /queue simple set $leafId limit-at=$share; };
          :local kind [:tostr ($leaf->"queue")];
          :if (($kind != "nister-device-aqm/nister-device-aqm") && ($kind != [:tostr [:toarray "nister-device-aqm,nister-device-aqm"]])) do={ /queue simple set $leafId queue=nister-device-aqm/nister-device-aqm; };
        };
      };
    };
  };
};
# Parent entries precede their children. Repair only an invalid order: moving
# existing queues on every reconciliation would reset their burst history.
:local ordered true; :local previous 0;
:foreach row in=[/queue simple print as-value] do={
    :local tier 5;
    :if (($row->"name") = "nister-infra-management") do={ :set tier 0; };
    :if (($row->"name") = "nister-site") do={ :set tier 1; };
    :if (($row->"comment") ~ "^NISTER ACCOUNT SHAPER") do={ :set tier 2; };
    :if (($row->"comment") = "NISTER DEVICE AQM") do={ :set tier 3; };
    :if (($row->"name") = "nister-unclassified") do={ :set tier 4; };
    :if ($tier < $previous) do={ :set ordered false; }; :set previous $tier;
};
:if (!$ordered) do={
    :local anchor [:pick [/queue simple find where name="nister-unclassified"] 0];
    :local first [:pick [/queue simple find] 0];
    :if ($anchor != $first) do={ /queue simple move $anchor $first; };
    :foreach q in=[/queue simple find where comment="NISTER DEVICE AQM"] do={ /queue simple move $q $anchor; };
    :set anchor [:pick [/queue simple find where comment="NISTER DEVICE AQM"] 0];
    :if ([:len $anchor] = 0) do={ :set anchor [:pick [/queue simple find where name="nister-unclassified"] 0]; };
    :foreach q in=[/queue simple find where comment~"^NISTER ACCOUNT SHAPER"] do={ /queue simple move $q $anchor; };
    :set anchor [:pick [/queue simple find where comment~"^NISTER ACCOUNT SHAPER"] 0];
    :if ([:len $anchor] = 0) do={ :set anchor [:pick [/queue simple find where name="nister-unclassified"] 0]; };
    :local root ($site->".id"); /queue simple move $root $anchor;
    :local infra [/queue simple find where name="nister-infra-management"];
    :if ([:len $infra] = 1) do={ /queue simple move $infra $root; };
};
};
