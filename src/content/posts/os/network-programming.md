---
title: Network Programming
description: >-
  A walk through the BSD sockets sequence — getaddrinfo, socket, bind, connect,
  listen, accept — and what each call actually does.
date: '2026-06-11'
category: os
tags: []
draft: false
source: os/Network Programming.md
---

- getaddrinfo
	- get a ton of info about the domain we are connecting to
	- does dns resolution
- socket
	- returns socket fd 
	- we can select whether we want PF_INET or PF_INET6
	- SOCK_STREAM or SOCK_DGRAM
	- also protocol if needed
- bind
	- associates socket with port
	- takes as args socket fd and struct sockaddr ( this is configured by getaddrinfo )
- connect
	- used by client to connect to server
	- takes in sock fd and remote server struct sockaddr as args
- listen
	- for server to start listening on server socket fd
	- takes backlog as arg and socket fd
- accept
	- used by server to accept client connection
	- takes as arg server socket fd , empty struct sockaddr to store client sockaddr object
	- returns a new socket fd used for comm with client
- send
	- to send data 
	- takes as input buffer, len, flags and sockfd
	- if client sending to server use client sockfd . If server sending to client then use the sockfd returned from accept func
	- atmost around 1K bytes can be sent the remaining if there needs to be sent separately
- recv
	- same as send 
- close , shutdown
	- to close sockfd or close parts of it in shutdown 
- getpeername
	- to hold the domain, ip of the person on other side
	- 
- sendto
	- send data using **udp**
	- takes args like sockfd of sender , buffer, len, flags, sockaddr containing receiver data
- recvfrom
	- similar to sendto
	- but keep the sockaddr empty , this is filled with sender ip, domain etc



**TCP flow**

client 
getaddrinfo, socket, bind,  connect,           send,          recv, close

server
socket, bind, listen,                           accept,         recv, send, close

**UDP flow**

client
getaddrinfo, socket, bind, sendto, close

server
socket, bind recvfrom, close


Note: 
- no listen, accpet in udp as these are used in tcp for 3 way handshake
- multiple clients use the same socketfd on server to communicate unlike tcp which creates new socketfd for each client
- 



**some important stuff**
- socket is a in memory kernel space file
- port number is part of hash table to map requests incoming to correct sockets based on socket address 
- no need for listen , accept in SOCK_DGRAM ( udp ) . server creates socket, binds then directly recvfrom. client creates socket , then sendto server ( binding happens under the hood to an ephemeral port )


| TCP                                                       | UDP                             |
| --------------------------------------------------------- | ------------------------------- |
| connection oriented                                       | connectionless                  |
| flow control to ensure receiver socket is not overwhelmed | nope                            |
| 3 way handshake to initate                                | just send udp packet and forget |
| proper termination                                        | nope                            |
| packets have sequence number to ensure ordering           | nope                            |


**Some extra stuff**

- generally recv, recvfrom , accept, connect are all blocking ; also getaddrinfo if doing dns resolution
- send, sendto are not blocking unless system resources are saturated 
- in send : waiting for ack is not done by program but handled by kernel , so if ack not received then kernel automatically retries in background 

**Advanced stuff**

- socket when creating can be changed to nonblocking socket but that is a bad idea 
- IO Multiplexing at O(n) uses poll(), select() . Both tell us which socket fds are ready for send, recv . Solution is to use epoll() which is O(1)
- Data Serialisation
	- sending as raw data, bad!
	- using sprintf for encoding, uses utf8 or ascii
	- custom binary encoding format , best for low bandwidth, high speed req
- data encapsulation
- Broadcast
	- broadcast within same subnet using all 255.255.255.255
	- broadcast to another subnet using their subnet network addr and sett all host bits to 1
	- only uses UDP no TCP
	- above only works for ipv4 , for ipv6 use multicasting

