TRUFFLE_LOOP_EXIT_CODE=0
for f in ./integration-test/test/*.js; do
	truffle test $f
	if [ $? -gt 0 ]; then
		TRUFFLE_LOOP_EXIT_CODE=1
	fi
done
exit $TRUFFLE_LOOP_EXIT_CODE
