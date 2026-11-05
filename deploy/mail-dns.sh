#!/bin/sh
set -eu
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends bind9 bind9-utils dnsutils
cat > /etc/bind/named.conf.options <<'EOF'
options {
    directory "/var/cache/bind";
    listen-on { 127.0.0.1; 149.28.40.44; };
    listen-on-v6 { none; };
    recursion no;
    allow-query { any; };
    allow-transfer { none; };
    version "not disclosed";
    rate-limit { responses-per-second 10; window 5; };
    dnssec-validation auto;
};
EOF
cat > /etc/bind/named.conf.local <<'EOF'
zone "send.mail.likedonkeykong.com" {
    type primary;
    file "/etc/bind/db.woggle-mail";
    allow-update { none; };
};
EOF
cat > /etc/bind/db.woggle-mail <<'EOF'
$TTL 300
@ IN SOA ns1.woggle-dns.likedonkeykong.com. hostmaster.likedonkeykong.com. (
  2026110501 3600 600 1209600 300 )
  IN NS ns1.woggle-dns.likedonkeykong.com.
  IN NS ns2.woggle-dns.likedonkeykong.com.
  IN MX 10 feedback-smtp.us-east-1.amazonses.com.
  IN TXT "v=spf1 include:amazonses.com ~all"
EOF
named-checkconf
named-checkzone send.mail.likedonkeykong.com /etc/bind/db.woggle-mail
ufw allow 53/tcp
ufw allow 53/udp
systemctl enable named
systemctl restart named
systemctl is-active named
dig @127.0.0.1 send.mail.likedonkeykong.com MX +noall +answer
dig @127.0.0.1 send.mail.likedonkeykong.com TXT +noall +answer
