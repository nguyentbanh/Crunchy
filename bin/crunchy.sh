#!/bin/bash
PARAMS=$*
for i in {1..20}; do
	crunchy -u ${PARAMS}
	if [ $? == 0 ]; then
	 	break
	fi
	echo "Going to retry..."	
	sleep 3
done