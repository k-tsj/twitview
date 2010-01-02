#!/usr/bin/env ruby
#  Copyright (C) 2004-2010 Kazuki Tsujimoto, All rights reserved.
#
#  Redistribution and use in source and binary forms, with or without
#  modification, are permitted provided that the following conditions
#  are met:
# 
#  1. Redistributions of source code must retain the above copyright
#     notice, this list of conditions and the following disclaimer.
# 
#  2. Redistributions in binary form must reproduce the above copyright
#     notice, this list of conditions and the following disclaimer in the
#     documentation and/or other materials provided with the distribution.
# 
#  3. Neither the name of the authors nor the names of its contributors
#     may be used to endorse or promote products derived from this
#     software without specific prior written permission.
# 
#  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
#  "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
#  LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
#  A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
#  OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
#  SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
#  TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
#  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
#  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
#  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
#  SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

require 'cgi'
require 'uri'
require 'open-uri'
require 'base64'

ALLOW_HOSTS = /\.twimg\.com\z/i

cgi = CGI.new
target_uri = URI.parse(CGI.unescape(cgi['uri'][0]))

print "Content-type: application/json\n\n"

if ALLOW_HOSTS =~ target_uri.host
  content_type = case File.extname(target_uri.path)
                 when /\A\.jpe?g\z/i
                   'image/jpeg'
                 when /\A\.png\z/i
                   'image/png'
                 when /\A\.gif\z/i
                   'image/gif'
                 else
                   raise "not supported"
                 end
  open(target_uri) do |f|
    s = %Q[#{cgi['callback'][0]}("data:#{content_type};base64,#{Base64.encode64(f.read).gsub(/\n/, '')}")]
    print s
  end
end
