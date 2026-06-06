#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib.sh"

GUARD_NAME="${GUARD_NAME:-nister_ap_phy_guard}"
GUARD_INTERVAL="${GUARD_INTERVAL:-5m}"
GUARD_PORTS_LABEL="${GUARD_PORTS_LABEL:-ether3,ether4}"

ros_string_escape() {
  printf '%s' "$1" | sed \
    -e 's/\\/\\\\/g' \
    -e 's/"/\\"/g' \
    -e 's/\$/\\$/g'
}

read -r -d '' GUARD_SOURCE <<'ROS' || true
:global napgE3Fail;
:global napgE3Hold;
:global napgE3Last;
:global napgE4Fail;
:global napgE4Hold;
:global napgE4Last;
:local maxFail 3;
:local holdCycles 6;
:if ([:typeof $napgE3Fail] = "nothing") do={ :set napgE3Fail 0; };
:if ([:typeof $napgE3Hold] = "nothing") do={ :set napgE3Hold 0; };
:if ([:typeof $napgE4Fail] = "nothing") do={ :set napgE4Fail 0; };
:if ([:typeof $napgE4Hold] = "nothing") do={ :set napgE4Hold 0; };
:local p "ether3";
:local i [/interface find where name=$p];
:if ([:len $i] = 0) do={ :log error "nister_ap_phy_guard: missing ether3"; } else={
  :if ([/interface get $i disabled]) do={ :log warning "nister_ap_phy_guard: ether3 disabled, skipping"; } else={
    :local downs [/interface get $i link-downs];
    :if ([:typeof $napgE3Last] = "nothing") do={ :set napgE3Last $downs; };
    :local delta ($downs - $napgE3Last);
    :set napgE3Last $downs;
    :local bad false;
    :if (![/interface get $i running]) do={ :set bad true; :log warning ("nister_ap_phy_guard: ether3 no-link link-downs=" . $downs); };
    :if ($delta >= 3) do={ :set bad true; :log warning ("nister_ap_phy_guard: ether3 flap delta=" . $delta . " link-downs=" . $downs); };
    :if (!$bad) do={ :set napgE3Fail 0; :set napgE3Hold 0; };
    :if ($bad) do={
      :if ($napgE3Hold > 0) do={ :set napgE3Hold ($napgE3Hold - 1); :log error ("nister_ap_phy_guard: ether3 rate-limited hold=" . $napgE3Hold); } else={
        :if ($napgE3Fail >= $maxFail) do={ :set napgE3Hold $holdCycles; :log error "nister_ap_phy_guard: ether3 needs onsite intervention"; } else={
          :set napgE3Fail ($napgE3Fail + 1);
          :log warning ("nister_ap_phy_guard: bouncing ether3 attempt=" . $napgE3Fail);
          /interface disable $i; :delay 5; /interface enable $i; :delay 10;
          :if ([/interface get $i running]) do={ :log warning "nister_ap_phy_guard: ether3 recovered"; :set napgE3Fail 0; } else={ :log error "nister_ap_phy_guard: ether3 still down after bounce"; };
        };
      };
    };
  };
};
:local p "ether4";
:local i [/interface find where name=$p];
:if ([:len $i] = 0) do={ :log error "nister_ap_phy_guard: missing ether4"; } else={
  :if ([/interface get $i disabled]) do={ :log warning "nister_ap_phy_guard: ether4 disabled, skipping"; } else={
    :local downs [/interface get $i link-downs];
    :if ([:typeof $napgE4Last] = "nothing") do={ :set napgE4Last $downs; };
    :local delta ($downs - $napgE4Last);
    :set napgE4Last $downs;
    :local bad false;
    :if (![/interface get $i running]) do={ :set bad true; :log warning ("nister_ap_phy_guard: ether4 no-link link-downs=" . $downs); };
    :if ($delta >= 3) do={ :set bad true; :log warning ("nister_ap_phy_guard: ether4 flap delta=" . $delta . " link-downs=" . $downs); };
    :if (!$bad) do={ :set napgE4Fail 0; :set napgE4Hold 0; };
    :if ($bad) do={
      :if ($napgE4Hold > 0) do={ :set napgE4Hold ($napgE4Hold - 1); :log error ("nister_ap_phy_guard: ether4 rate-limited hold=" . $napgE4Hold); } else={
        :if ($napgE4Fail >= $maxFail) do={ :set napgE4Hold $holdCycles; :log error "nister_ap_phy_guard: ether4 needs onsite intervention"; } else={
          :set napgE4Fail ($napgE4Fail + 1);
          :log warning ("nister_ap_phy_guard: bouncing ether4 attempt=" . $napgE4Fail);
          /interface disable $i; :delay 5; /interface enable $i; :delay 10;
          :if ([/interface get $i running]) do={ :log warning "nister_ap_phy_guard: ether4 recovered"; :set napgE4Fail 0; } else={ :log error "nister_ap_phy_guard: ether4 still down after bounce"; };
        };
      };
    };
  };
};
ROS

GUARD_SOURCE_ONE_LINE="$(printf '%s' "$GUARD_SOURCE" | tr '\n' ' ')"
GUARD_SOURCE_ESCAPED="$(ros_string_escape "$GUARD_SOURCE_ONE_LINE")"
GUARD_NAME_ESCAPED="$(ros_string_escape "$GUARD_NAME")"
GUARD_INTERVAL_ESCAPED="$(ros_string_escape "$GUARD_INTERVAL")"

router_ssh ":put \"AP_PHY_GUARD_INSTALL_START ports=${GUARD_PORTS_LABEL}\"; /system scheduler remove [find where name=\"nister_ether4_phy_self_heal\"]; /system script remove [find where name=\"nister_ether4_phy_self_heal\"]; /system scheduler remove [find where name=\"$GUARD_NAME_ESCAPED\"]; /system script remove [find where name=\"$GUARD_NAME_ESCAPED\"]; /system script add name=\"$GUARD_NAME_ESCAPED\" policy=read,write,test source=\"$GUARD_SOURCE_ESCAPED\"; /system scheduler add name=\"$GUARD_NAME_ESCAPED\" interval=\"$GUARD_INTERVAL_ESCAPED\" start-time=startup on-event=\"/system script run $GUARD_NAME_ESCAPED\"; /system script run \"$GUARD_NAME_ESCAPED\"; :put \"AP_PHY_GUARD_INSTALL_DONE\"; /system scheduler print detail where name=\"$GUARD_NAME_ESCAPED\"; /system script print detail where name=\"$GUARD_NAME_ESCAPED\"; /interface print detail where name~\"ether3|ether4\""
