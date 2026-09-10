import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';
import 'package:table_calendar/table_calendar.dart';

class AdminCreateTimetableScreen extends StatefulWidget {

  final String institutionId;
  final String selectedClass;
  final String selectedSection;
  final List<dynamic>? existingPeriods;

  const AdminCreateTimetableScreen({
    super.key,
    required this.institutionId,
    required this.selectedClass,
    required this.selectedSection,
    this.existingPeriods,
  });

  @override
  State<AdminCreateTimetableScreen> createState() =>
      _AdminCreateTimetableScreenState();
}

class _AdminCreateTimetableScreenState
    extends State<AdminCreateTimetableScreen> {

  DateTimeRange? selectedRange;

  /// 🔥 HOLIDAYS
  List<DateTime> excludedDates = [];
  bool isSaving = false;

  List<Map<String, dynamic>> periods = [];
  List<Map<String, dynamic>> teachers = [];

  List<String> classes = [];
  List<String> sections = [];

  String selectedClass = "";
  String selectedSection = "";

  List<int> sh = [], sm = [], eh = [], em = [];
  List<String> sap = [], eap = [];

  List<int> hours =
  List.generate(12, (i) => i + 1);

  List<int> minutes =
  List.generate(12, (i) => i * 5);

  List<String> ampmList = [
    "AM",
    "PM",
  ];

  @override
  void initState() {
    super.initState();

    selectedClass = "";
    selectedSection = "";

    fetchTeachers();
    fetchClasses();
  }

  /// 🔥 FETCH TEACHERS
  Future<void> fetchTeachers() async {

    final snapshot =
    await FirebaseFirestore.instance
        .collection('users')
        .where(
      'institutionId',
      isEqualTo:
      widget.institutionId,
    )
        .where(
      'role',
      isEqualTo: 'teacher',
    )
        .get();

    teachers =
        snapshot.docs.map((doc) {

          return {
            "id": doc.id,
            "name": doc['name'],
          };
        }).toList();

    setState(() {});
  }

  /// 🔥 FETCH CLASSES
  Future<void> fetchClasses() async {

    final snapshot =
    await FirebaseFirestore.instance
        .collection('classes')
        .where(
      'institutionId',
      isEqualTo:
      widget.institutionId,
    )
        .get();

    classes = snapshot.docs
        .map(
          (e) =>
          e['class'].toString(),
    )
        .toList();

    await fetchSections();
  }

  /// 🔥 FETCH SECTIONS
  Future<void> fetchSections() async {

    final doc =
    await FirebaseFirestore.instance
        .collection('classes')
        .where(
      'institutionId',
      isEqualTo:
      widget.institutionId,
    )
        .where(
      'class',
      isEqualTo:
      selectedClass,
    )
        .limit(1)
        .get();

    if (doc.docs.isNotEmpty) {

      sections =
      List<String>.from(
        doc.docs.first['sections'],
      );

      if (!sections.contains(
        selectedSection,
      )) {

        selectedSection = "";
      }
    }

    setState(() {});
  }

  /// 🔥 ADD PERIOD
  void addBlock() {

    setState(() {

      int startH = 9;
      int startM = 0;
      String startAP = "AM";

      if (periods.isNotEmpty) {

        /// 🔥 START NEXT PERIOD
        /// FROM PREVIOUS END TIME

        startH = eh.last;
        startM = em.last;
        startAP = eap.last;

        /// 🔥 AUTO HANDLE
        /// MINUTE OVERFLOW

        if (startM >= 60) {

          startH += 1;
          startM -= 60;
        }

        /// 🔥 HANDLE AM/PM SWITCH

        if (startH > 12) {
          startH = 1;
        }

        if (
        eh.last == 11 &&
            em.last >= 55 &&
            eap.last == "AM"
        ) {
          startAP = "PM";
        }
      }

      periods.add({
        "subject": "",
        "type": "subject",
        "startTime": "",
        "endTime": "",
        "teacherId": "",
        "teacherName": "",
      });

      sh.add(startH);
      sm.add(startM);
      sap.add(startAP);

      int endH = startH;
      int endM = startM + 45;
      String endAP = startAP;

      /// 🔥 HANDLE OVERFLOW

      if (endM >= 60) {

        endH += 1;
        endM -= 60;
      }

      /// 🔥 HANDLE 12

      if (endH > 12) {

        endH = 1;
      }

      /// 🔥 HANDLE AM → PM

      if (
      startH == 11 &&
          startAP == "AM" &&
          endM >= 0
      ) {

        endAP = "PM";
      }

      eh.add(endH);
      em.add(endM);
      eap.add(endAP);

      updateTime(
        periods.length - 1,
      );
    });
  }

  /// 🔥 DELETE PERIOD
  void deleteBlock(int index) {

    setState(() {

      periods.removeAt(index);

      sh.removeAt(index);
      sm.removeAt(index);

      eh.removeAt(index);
      em.removeAt(index);

      sap.removeAt(index);
      eap.removeAt(index);
    });
  }

  /// 🔥 FORMAT TIME
  String formatTime(
      int h,
      int m,
      String ap,
      ) {

    int hour = h;

    if (ap == "PM" && h != 12) {
      hour += 12;
    }

    if (ap == "AM" && h == 12) {
      hour = 0;
    }

    return "${hour.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}";
  }

  /// 🔥 UPDATE TIME
  void updateTime(int i) {

    periods[i]['startTime'] =
        formatTime(
          sh[i],
          sm[i],
          sap[i],
        );

    periods[i]['endTime'] =
        formatTime(
          eh[i],
          em[i],
          eap[i],
        );
  }

  Future<void> openScheduleCalendar() async {

    DateTime? tempStartDate =
        selectedRange?.start;

    DateTime? tempEndDate =
        selectedRange?.end;

    List<DateTime> tempExcluded =
    List.from(excludedDates);

    await showModalBottomSheet(
      context: context,

      isScrollControlled: false,

      backgroundColor: Colors.white,
      constraints: BoxConstraints(
        maxHeight:
        MediaQuery.of(context).size.height * 0.92,
      ),

      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(28),
        ),
      ),

      builder: (_) {

        return StatefulBuilder(
          builder: (
              context,
              setModalState,
              ) {
            Future<void> pickStartDate() async {

              final picked =
              await showDatePicker(
                context: context,

                firstDate:
                DateTime(2020),

                lastDate:
                DateTime(2035),

                initialDate:
                tempStartDate ??
                    DateTime.now(),
              );

              if (picked != null) {

                setModalState(() {

                  tempStartDate = picked;

                  if (tempEndDate != null &&
                      tempEndDate!.isBefore(
                        picked,
                      )) {

                    tempEndDate = null;
                  }
                });
              }
            }

            Future<void> pickEndDate() async {

              if (tempStartDate ==
                  null) {

                ScaffoldMessenger.of(
                  context,
                ).showSnackBar(

                  const SnackBar(
                    content: Text(
                      "Select start date first",
                    ),
                  ),
                );

                return;
              }

              final picked =
              await showDatePicker(
                context: context,

                firstDate:
                tempStartDate!,

                lastDate:
                tempStartDate!.add(
                  const Duration(
                    days: 31,
                  ),
                ),

                initialDate:
                tempEndDate ??
                    tempStartDate!,
              );

              if (picked != null) {

                setModalState(() {

                  tempEndDate = picked;
                });
              }
            }

            return Padding(
              padding:
              const EdgeInsets.fromLTRB(
                24,
                24,
                24,
                32,
              ),

              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment:
                  CrossAxisAlignment
                      .start,

                  children: [

                    const Text(
                      "Schedule Range",

                      style: TextStyle(
                        fontSize: 26,
                        fontWeight:
                        FontWeight.bold,
                      ),
                    ),

                    const SizedBox(
                      height: 8,
                    ),

                    Text(
                      "Select your timetable duration and holidays.",

                      style: TextStyle(
                        fontSize: 14,
                        color:
                        Colors.grey
                            .shade600,
                        height: 1.5,
                      ),
                    ),

                    const SizedBox(
                      height: 28,
                    ),

                    /// 🔹 START DATE
                    GestureDetector(
                      onTap:
                      pickStartDate,

                      child: Container(
                        padding:
                        const EdgeInsets.symmetric(
                          horizontal: 18,
                          vertical: 16,
                        ),

                        decoration:
                        BoxDecoration(
                          color:
                          const Color(
                            0xFFF7F7F7,
                          ),

                          borderRadius:
                          BorderRadius.circular(
                            18,
                          ),
                        ),

                        child: Row(
                          children: [

                            const Icon(
                              Icons
                                  .calendar_today,
                              size: 18,
                            ),

                            const SizedBox(
                              width: 12,
                            ),

                            Expanded(
                              child: Text(
                                tempStartDate ==
                                    null
                                    ? "Select Start Date"
                                    : DateFormat(
                                  "dd MMM yyyy",
                                ).format(
                                  tempStartDate!,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(
                      height: 16,
                    ),

                    /// 🔹 END DATE
                    GestureDetector(
                      onTap:
                      pickEndDate,

                      child: Container(
                        padding:
                        const EdgeInsets.symmetric(
                          horizontal: 18,
                          vertical: 16,
                        ),

                        decoration:
                        BoxDecoration(
                          color:
                          const Color(
                            0xFFF7F7F7,
                          ),

                          borderRadius:
                          BorderRadius.circular(
                            18,
                          ),
                        ),

                        child: Row(
                          children: [

                            const Icon(
                              Icons
                                  .calendar_today,
                              size: 18,
                            ),

                            const SizedBox(
                              width: 12,
                            ),

                            Expanded(
                              child: Text(
                                tempEndDate ==
                                    null
                                    ? "Select End Date"
                                    : DateFormat(
                                  "dd MMM yyyy",
                                ).format(
                                  tempEndDate!,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(
                      height: 20,
                    ),

                    const SizedBox(
                      height: 24,
                    ),

                    Text(
                      "Select Holidays",

                      style: TextStyle(
                        fontSize: 18,
                        fontWeight:
                        FontWeight.w600,
                        color:
                        Colors.grey
                            .shade900,
                      ),
                    ),

                    const SizedBox(
                      height: 6,
                    ),

                    Text(
                      "Tap on days to exclude from the timetable.",

                      style: TextStyle(
                        fontSize: 13,
                        color:
                        Colors.grey
                            .shade600,
                      ),
                    ),

                    GestureDetector(
                      onTap: () async {

                        if (tempStartDate == null ||
                            tempEndDate == null) {

                          ScaffoldMessenger.of(
                            context,
                          ).showSnackBar(

                            const SnackBar(
                              content: Text(
                                "Select start and end dates first",
                              ),
                            ),
                          );

                          return;
                        }

                        await showModalBottomSheet(

                          context: context,

                          backgroundColor: Colors.white,

                          shape:
                          const RoundedRectangleBorder(
                            borderRadius:
                            BorderRadius.vertical(
                              top: Radius.circular(28),
                            ),
                          ),

                          builder: (_) {

                            return StatefulBuilder(
                              builder: (
                                  context,
                                  holidayState,
                                  ) {

                                return Padding(
                                  padding:
                                  const EdgeInsets.all(20),

                                    child: SizedBox(
                                      height: 500,

                                      child: Column(

                                    children: [

                                      TableCalendar(

                                        firstDay:
                                        tempStartDate!,

                                        lastDay:
                                        tempEndDate!,

                                        focusedDay:
                                        tempStartDate!,

                                        headerStyle:
                                        const HeaderStyle(
                                          formatButtonVisible:
                                          false,

                                          titleCentered:
                                          true,
                                        ),

                                        selectedDayPredicate:
                                            (day) {

                                          return tempExcluded.any(
                                                (d) =>
                                                isSameDay(
                                                  d,
                                                  day,
                                                ),
                                          );
                                        },

                                        onDaySelected:
                                            (
                                            selectedDay,
                                            focusedDay,
                                            ) {

                                          final exists =
                                          tempExcluded.any(
                                                (d) =>
                                                isSameDay(
                                                  d,
                                                  selectedDay,
                                                ),
                                          );

                                          holidayState(() {

                                            if (exists) {

                                              tempExcluded.removeWhere(
                                                    (d) =>
                                                    isSameDay(
                                                      d,
                                                      selectedDay,
                                                    ),
                                              );

                                            } else {

                                              tempExcluded.add(
                                                selectedDay,
                                              );
                                            }
                                          });
                                        },
                                      ),

                                      const SizedBox(
                                        height: 20,
                                      ),

                                      SizedBox(
                                        width: double.infinity,

                                        child: ElevatedButton(
                                          onPressed: () {

                                            setModalState(() {});

                                            Navigator.pop(
                                              context,
                                            );
                                          },

                                          style:
                                          ElevatedButton.styleFrom(
                                            backgroundColor:
                                            Colors.black,

                                            minimumSize:
                                            const Size(
                                              double.infinity,
                                              54,
                                            ),
                                          ),

                                          child: const Text(
                                            "Done",

                                            style: TextStyle(
                                              color:
                                              Colors.white,
                                            ),
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                    ),
                                );
                              },
                            );
                          },
                        );
                      },

                      child: Container(
                        padding:
                        const EdgeInsets.symmetric(
                          horizontal: 18,
                          vertical: 16,
                        ),

                        decoration: BoxDecoration(
                          color:
                          const Color(0xFFF7F7F7),

                          borderRadius:
                          BorderRadius.circular(
                            18,
                          ),
                        ),

                        child: Row(
                          children: [

                            const Icon(
                              Icons.event_busy,
                              size: 20,
                            ),

                            const SizedBox(width: 12),

                            Expanded(
                              child: Text(

                                tempExcluded.isEmpty
                                    ? "Select Holidays"
                                    : "${tempExcluded.length} Holidays Selected",
                              ),
                            ),

                            const Icon(
                              Icons.arrow_forward_ios,
                              size: 14,
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 18),

                    const SizedBox(
                      height: 20,
                    ),

                    SizedBox(
                      width: double.infinity,

                      child: ElevatedButton(
                        onPressed: () {

                          if (tempStartDate ==
                              null ||
                              tempEndDate ==
                                  null) {

                            ScaffoldMessenger.of(
                              context,
                            ).showSnackBar(

                              const SnackBar(
                                content: Text(
                                  "Select start and end dates",
                                ),
                              ),
                            );

                            return;
                          }

                          setState(() {

                            selectedRange =
                                DateTimeRange(
                                  start:
                                  tempStartDate!,
                                  end:
                                  tempEndDate!,
                                );

                            excludedDates =
                                tempExcluded;
                          });

                          Navigator.pop(
                            context,
                          );
                        },

                        style:
                        ElevatedButton.styleFrom(
                          backgroundColor:
                          Colors.black,

                          minimumSize:
                          const Size(
                            double.infinity,
                            56,
                          ),

                          shape:
                          RoundedRectangleBorder(
                            borderRadius:
                            BorderRadius.circular(
                              18,
                            ),
                          ),
                        ),

                        child: const Text(
                          "Save",

                          style: TextStyle(
                            color:
                            Colors.white,
                            fontSize: 16,
                            fontWeight:
                            FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  /// 🔥 APPLY SCHEDULE
  Future<void> applySchedule() async {

    if (isSaving) return;
    if (selectedClass.isEmpty) {

      ScaffoldMessenger.of(context)
          .showSnackBar(

        const SnackBar(
          content: Text(
            "Please select class",
          ),
        ),
      );

      return;
    }

    if (selectedSection.isEmpty) {

      ScaffoldMessenger.of(context)
          .showSnackBar(

        const SnackBar(
          content: Text(
            "Please select section",
          ),
        ),
      );

      return;
    }

    if (periods.isEmpty) {

      ScaffoldMessenger.of(context)
          .showSnackBar(

        const SnackBar(
          content: Text(
            "Add at least one period",
          ),
        ),
      );

      return;
    }
    for (int i = 0; i < periods.length; i++) {

      final isBreak =
          periods[i]['type'] == "break";

      if (!isBreak) {

        if ((periods[i]['subject'] ?? "")
            .toString()
            .trim()
            .isEmpty) {

          ScaffoldMessenger.of(context)
              .showSnackBar(

            SnackBar(
              content: Text(
                "Enter subject for Period ${i + 1}",
              ),
            ),
          );

          return;
        }

        if ((periods[i]['teacherId'] ?? "")
            .toString()
            .trim()
            .isEmpty) {

          ScaffoldMessenger.of(context)
              .showSnackBar(

            SnackBar(
              content: Text(
                "Select teacher for Period ${i + 1}",
              ),
            ),
          );

          return;
        }
      }
    }
    if (selectedRange == null) {

      setState(() {
        isSaving = false;
      });

      return;
    }

    setState(() {
      isSaving = true;
    });

    try {

      /// 🔥 STEP 1:
      /// DELETE OLD TIMETABLES
      /// FOR THIS RANGE

      DateTime deleteCurrent =
          selectedRange!.start;

      while (!deleteCurrent.isAfter(
        selectedRange!.end,
      )) {

        final deleteDateKey =
        DateFormat(
          'yyyy-MM-dd',
        ).format(deleteCurrent);

        final oldDocId =
            "${widget.institutionId}_${selectedClass}_${selectedSection}_$deleteDateKey";

        await FirebaseFirestore.instance
            .collection('timetable')
            .doc(oldDocId)
            .delete()
            .catchError((_) {});

        deleteCurrent = deleteCurrent.add(
          const Duration(days: 1),
        );
      }

      /// 🔥 STEP 2:
      /// CREATE NEW TIMETABLE

      DateTime current =
          selectedRange!.start;

      while (!current.isAfter(
        selectedRange!.end,
      )) {

        /// 🔥 SKIP HOLIDAYS

        final isExcluded =
        excludedDates.any(
              (d) =>
          d.year == current.year &&
              d.month == current.month &&
              d.day == current.day,
        );

        if (isExcluded) {

          current = current.add(
            const Duration(days: 1),
          );

          continue;
        }

        final dateKey =
        DateFormat(
          'yyyy-MM-dd',
        ).format(current);

        final docId =
            "${widget.institutionId}_${selectedClass}_${selectedSection}_$dateKey";

        await FirebaseFirestore.instance
            .collection('timetable')
            .doc(docId)
            .set({

          "institutionId":
          widget.institutionId,

          "class":
          selectedClass,

          "section":
          selectedSection,

          "date": dateKey,

          "createdAt":
          FieldValue.serverTimestamp(),

          "periods": List.generate(
            periods.length,
                (i) {

              final start =
              formatTime(
                sh[i],
                sm[i],
                sap[i],
              );

              final end =
              formatTime(
                eh[i],
                em[i],
                eap[i],
              );

              final subject =
              (periods[i]['subject'] ?? "")
                  .toLowerCase();

              return {

                ...periods[i],

                "startTime": start,
                "endTime": end,

                "type":
                subject == "break"
                    ? "break"
                    : "subject",
              };
            },
          ),
        });

        current = current.add(
          const Duration(days: 1),
        );
      }

      if (mounted) {

        setState(() {
          isSaving = false;
        });

        Navigator.of(context).pop(true);
      }

    } catch (e) {

      setState(() {
        isSaving = false;
      });

      ScaffoldMessenger.of(context)
          .showSnackBar(

        SnackBar(
          content: Text(
            "Failed: $e",
          ),
        ),
      );
    }
  }
  /// 🔥 SELECTION BOX
  Widget selectionBox({
    required String text,
    required VoidCallback onTap,
  }) {

    return Expanded(
      child: GestureDetector(
        onTap: onTap,

        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 14,
          ),

          decoration: BoxDecoration(
            color: const Color(0xFFF7F7F7),

            borderRadius:
            BorderRadius.circular(16),
          ),

          child: Row(
            mainAxisAlignment:
            MainAxisAlignment.spaceBetween,

            children: [

              Text(text),

              const Icon(
                Icons.keyboard_arrow_down,
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// 🔥 TIME SELECTOR
  Widget selectorBox({
    required Widget child,
  }) {

    return Container(
      padding:
      const EdgeInsets.symmetric(
        horizontal: 10,
      ),

      decoration: BoxDecoration(
        color:
        const Color(0xFFF7F7F7),

        borderRadius:
        BorderRadius.circular(14),
      ),

      child: child,
    );
  }

  /// 🔥 TIME CARD
  Widget timeCard(
      String title,
      int h,
      int m,
      String ap,
      Function(
          int,
          int,
          String,
          ) onChanged,
      ) {

    return Column(
      crossAxisAlignment:
      CrossAxisAlignment.start,

      children: [

        Text(
          title,
          style: TextStyle(
            fontSize: 13,
            color:
            Colors.grey.shade600,
            fontWeight:
            FontWeight.w500,
          ),
        ),

        const SizedBox(height: 10),

        Row(
          children: [

            Expanded(
              child: selectorBox(
                child:
                DropdownButton<int>(
                  value: h,
                  isExpanded: true,
                  underline:
                  const SizedBox(),

                  items: hours.map((e) {

                    return DropdownMenuItem(
                      value: e,
                      child: Text(
                        e.toString(),
                      ),
                    );
                  }).toList(),

                  onChanged: (v) {
                    onChanged(
                      v!,
                      m,
                      ap,
                    );
                  },
                ),
              ),
            ),

            const SizedBox(width: 10),

            Expanded(
              child: selectorBox(
                child:
                DropdownButton<int>(
                  value: m,
                  isExpanded: true,
                  underline:
                  const SizedBox(),

                  items:
                  minutes.map((e) {

                    return DropdownMenuItem(
                      value: e,
                      child: Text(
                        e.toString()
                            .padLeft(
                          2,
                          '0',
                        ),
                      ),
                    );
                  }).toList(),

                  onChanged: (v) {
                    onChanged(
                      h,
                      v!,
                      ap,
                    );
                  },
                ),
              ),
            ),

            const SizedBox(width: 10),

            Expanded(
              child: selectorBox(
                child:
                DropdownButton<String>(
                  value: ap,
                  isExpanded: true,
                  underline:
                  const SizedBox(),

                  items:
                  ampmList.map((e) {

                    return DropdownMenuItem(
                      value: e,
                      child: Text(e),
                    );
                  }).toList(),

                  onChanged: (v) {
                    onChanged(
                      h,
                      m,
                      v!,
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {

    return Scaffold(
      backgroundColor: Colors.white,

      body: SafeArea(
        child: Column(
          crossAxisAlignment:
          CrossAxisAlignment.start,

          children: [

            Padding(
              padding:
              const EdgeInsets.fromLTRB(
                20,
                20,
                20,
                0,
              ),

              child: Column(
                crossAxisAlignment:
                CrossAxisAlignment.start,

                children: [

                  const Text(
                    "Create Timetable",
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight:
                      FontWeight.bold,
                    ),
                  ),

                  const SizedBox(height: 8),

                  Text(
                    "Build class schedule",
                    style: TextStyle(
                      fontSize: 14,
                      color:
                      Colors.grey.shade600,
                    ),
                  ),

                  const SizedBox(height: 16),

                  Divider(
                    color:
                    Colors.grey.shade200,
                  ),

                  const SizedBox(height: 16),
                  /// 🔹 CLASS + SECTION
                  Row(
                    children: [

                      selectionBox(

                        text: selectedClass.isEmpty
                            ? "Select Class"
                            : "Class $selectedClass",

                        onTap: () async {

                          final selected =
                          await showModalBottomSheet(
                            context: context,

                            builder: (_) {

                              return ListView(
                                children:
                                classes.map((c) {

                                  return ListTile(
                                    title: Text(c),

                                    onTap: () {
                                      Navigator.pop(
                                        context,
                                        c,
                                      );
                                    },
                                  );
                                }).toList(),
                              );
                            },
                          );

                          if (selected != null) {

                            setState(() {

                              selectedClass = selected;
                              selectedSection = "";
                            });

                            await fetchSections();
                          }
                        },
                      ),

                      const SizedBox(width: 12),

                      selectionBox(

                        text: selectedSection.isEmpty
                            ? "Select Section"
                            : "Section $selectedSection",

                        onTap: () async {

                          if (selectedClass.isEmpty) {

                            ScaffoldMessenger.of(context)
                                .showSnackBar(

                              const SnackBar(
                                content: Text(
                                  "Select class first",
                                ),
                              ),
                            );

                            return;
                          }

                          final selected =
                          await showModalBottomSheet(
                            context: context,

                            builder: (_) {

                              return ListView(
                                children:
                                sections.map((s) {

                                  return ListTile(
                                    title: Text(s),

                                    onTap: () {
                                      Navigator.pop(
                                        context,
                                        s,
                                      );
                                    },
                                  );
                                }).toList(),
                              );
                            },
                          );

                          if (selected != null) {

                            setState(() {
                              selectedSection = selected;
                            });
                          }
                        },
                      ),
                    ],
                  ),

                  const SizedBox(height: 18),

                  /// 🔹 DATE RANGE
                  GestureDetector(
                    onTap:
                    openScheduleCalendar,

                    child: Container(
                      padding:
                      const EdgeInsets.symmetric(
                        horizontal: 18,
                        vertical: 16,
                      ),

                      decoration:
                      BoxDecoration(
                        color:
                        const Color(
                          0xFFF7F7F7,
                        ),

                        borderRadius:
                        BorderRadius.circular(
                          18,
                        ),
                      ),

                      child: Row(
                        children: [

                          const Icon(
                            Icons.calendar_today,
                            size: 18,
                          ),

                          const SizedBox(
                            width: 12,
                          ),

                          Expanded(
                            child: Text(
                              selectedRange ==
                                  null
                                  ? "Select Date Range"
                                  : "${DateFormat('MMM d').format(selectedRange!.start)} → ${DateFormat('MMM d').format(selectedRange!.end)}",
                            ),
                          ),

                          const Icon(
                            Icons
                                .arrow_forward_ios,
                            size: 14,
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 18),

                  Divider(
                    color:
                    Colors.grey.shade200,
                  ),
                ],
              ),
            ),

            /// 🔽 PERIODS
            Expanded(
              child: ListView.builder(
                padding:
                const EdgeInsets.all(
                  20,
                ),

                itemCount:
                periods.length,

                itemBuilder:
                    (_, index) {

                  final isBreak =
                      periods[index]['type'] ==
                          "break";

                  return Container(
                    margin:
                    const EdgeInsets.only(
                      bottom: 18,
                    ),

                    padding:
                    const EdgeInsets.all(
                      20,
                    ),

                    decoration:
                    BoxDecoration(
                      color:
                      isBreak
                          ? const Color(
                        0xFFF8F8F8,
                      )
                          : Colors.white,

                      borderRadius:
                      BorderRadius.circular(
                        22,
                      ),

                      border: Border.all(
                        color: Colors
                            .grey
                            .shade200,
                      ),
                    ),

                    child: Column(
                      crossAxisAlignment:
                      CrossAxisAlignment
                          .start,

                      children: [

                        Row(
                          mainAxisAlignment:
                          MainAxisAlignment
                              .spaceBetween,

                          children: [

                            Text(
                              "Period ${index + 1}",

                              style:
                              const TextStyle(
                                fontSize: 18,
                                fontWeight:
                                FontWeight
                                    .bold,
                              ),
                            ),

                            IconButton(
                              onPressed: () {
                                deleteBlock(
                                  index,
                                );
                              },

                              icon: Icon(
                                Icons.delete,
                                color: Colors
                                    .red
                                    .shade400,
                              ),
                            ),
                          ],
                        ),

                        const SizedBox(
                          height: 20,
                        ),

                        timeCard(
                          "Start Time",
                          sh[index],
                          sm[index],
                          sap[index],
                              (
                              h,
                              m,
                              ap,
                              ) {

                            setState(() {

                              sh[index] = h;
                              sm[index] = m;
                              sap[index] = ap;

                              updateTime(
                                index,
                              );
                            });
                          },
                        ),

                        const SizedBox(
                          height: 20,
                        ),

                        timeCard(
                          "End Time",
                          eh[index],
                          em[index],
                          eap[index],
                              (
                              h,
                              m,
                              ap,
                              ) {

                            setState(() {

                              eh[index] = h;
                              em[index] = m;
                              eap[index] = ap;

                              updateTime(
                                index,
                              );
                            });
                          },
                        ),

                        const SizedBox(
                          height: 20,
                        ),

                        DropdownButtonFormField<
                            String>(
                          value:
                          periods[index]['type'],

                          decoration:
                          InputDecoration(
                            labelText:
                            "Type",

                            filled: true,

                            fillColor:
                            const Color(
                              0xFFF7F7F7,
                            ),

                            border:
                            OutlineInputBorder(
                              borderRadius:
                              BorderRadius.circular(
                                16,
                              ),

                              borderSide:
                              BorderSide.none,
                            ),
                          ),

                          items: const [

                            DropdownMenuItem(
                              value:
                              "subject",
                              child:
                              Text("Class"),
                            ),

                            DropdownMenuItem(
                              value:
                              "break",
                              child:
                              Text("Break"),
                            ),
                          ],

                          onChanged: (v) {

                            setState(() {

                              periods[index]
                              ['type'] = v;

                              if (v ==
                                  "break") {

                                periods[index]
                                ['subject'] =
                                "Break";

                                periods[index]
                                ['teacherId'] =
                                "";

                                periods[index]
                                ['teacherName'] =
                                "";
                              }
                            });
                          },
                        ),

                        const SizedBox(
                          height: 18,
                        ),

                        TextField(
                          enabled:
                          !isBreak,

                          decoration:
                          InputDecoration(
                            hintText:
                            "Subject",

                            filled: true,

                            fillColor:
                            const Color(
                              0xFFF7F7F7,
                            ),

                            border:
                            OutlineInputBorder(
                              borderRadius:
                              BorderRadius.circular(
                                16,
                              ),

                              borderSide:
                              BorderSide.none,
                            ),
                          ),

                          onChanged: (v) {

                            periods[index]
                            ['subject'] = v;
                          },
                        ),

                        const SizedBox(
                          height: 18,
                        ),

                        GestureDetector(
                          onTap:
                          isBreak
                              ? null
                              : () async {

                            final selected =
                            await showModalBottomSheet(
                              context:
                              context,

                              builder:
                                  (_) {

                                return ListView(
                                  children:
                                  teachers.map(
                                        (t) {

                                      return ListTile(
                                        title:
                                        Text(
                                          t['name'],
                                        ),

                                        onTap:
                                            () {

                                          Navigator.pop(
                                            context,
                                            t,
                                          );
                                        },
                                      );
                                    },
                                  ).toList(),
                                );
                              },
                            );

                            if (selected !=
                                null) {

                              setState(() {

                                periods[index]
                                ['teacherId'] =
                                selected[
                                'id'];

                                periods[index]
                                ['teacherName'] =
                                selected[
                                'name'];
                              });
                            }
                          },

                          child: Container(
                            padding:
                            const EdgeInsets.symmetric(
                              horizontal:
                              16,
                              vertical:
                              16,
                            ),

                            decoration:
                            BoxDecoration(
                              color:
                              const Color(
                                0xFFF7F7F7,
                              ),

                              borderRadius:
                              BorderRadius.circular(
                                16,
                              ),
                            ),

                            child: Row(
                              children: [

                                const Icon(
                                  Icons
                                      .person_outline,
                                ),

                                const SizedBox(
                                  width: 12,
                                ),

                                Expanded(
                                  child: Text(
                                    isBreak
                                        ? "No Teacher"
                                        : (periods[index]['teacherName']
                                        ?.isNotEmpty ==
                                        true
                                        ? periods[index]['teacherName']
                                        : "Select Teacher"),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),

            /// 🔹 BOTTOM BUTTONS
            Padding(
              padding:
              const EdgeInsets.fromLTRB(
                20,
                0,
                20,
                20,
              ),

              child: Column(
                children: [

                  OutlinedButton(
                    onPressed: addBlock,

                    style:
                    OutlinedButton.styleFrom(
                      minimumSize:
                      const Size(
                        double.infinity,
                        54,
                      ),

                      shape:
                      RoundedRectangleBorder(
                        borderRadius:
                        BorderRadius.circular(
                          18,
                        ),
                      ),
                    ),

                    child: const Text(
                      "+ Add Period",
                    ),
                  ),

                  const SizedBox(height: 14),

                  ElevatedButton(
                    onPressed:
                    applySchedule,

                    style:
                    ElevatedButton.styleFrom(
                      backgroundColor:
                      Colors.black,

                      minimumSize:
                      const Size(
                        double.infinity,
                        56,
                      ),

                      shape:
                      RoundedRectangleBorder(
                        borderRadius:
                        BorderRadius.circular(
                          18,
                        ),
                      ),
                    ),

                    child: isSaving
                        ? const SizedBox(
                      height: 22,
                      width: 22,
                      child:
                      CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                        : const Text(
                      "Apply Schedule",
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight:
                        FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}